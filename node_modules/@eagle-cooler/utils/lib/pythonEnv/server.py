import os
import json
import threading
import queue
from flask import Flask, request, Response, stream_with_context
import subprocess

app = Flask(__name__)

# Store plugin processes and their I/O queues
plugin_processes = {}
plugin_queues = {}

# Global queues for all output
global_queues = {
    'stdout': queue.Queue(),
    'stderr': queue.Queue()
}

def create_process(plugin_id, python_path, file_path):
    """Create a new Python process for a plugin"""
    process = subprocess.Popen(
        [python_path, file_path],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        universal_newlines=True
    )
    
    # Create queues for I/O
    stdout_queue = queue.Queue()
    stderr_queue = queue.Queue()
    stdin_queue = queue.Queue()
    
    plugin_processes[plugin_id] = process
    plugin_queues[plugin_id] = {
        'stdout': stdout_queue,
        'stderr': stderr_queue,
        'stdin': stdin_queue
    }
    
    return process

def relay_output(process, queue, output_type, plugin_id):
    """Relay process output to queue and print with plugin ID marker"""
    for line in iter(process.readline, ''):
        formatted_line = f"<{plugin_id}> [{output_type}] {line.rstrip()}"
        
        # Add to plugin-specific queue
        queue.put(line)
        
        # Add to global queue with plugin ID
        global_queues[output_type].put(formatted_line)
        
        # Print with plugin ID marker
        print(formatted_line)

def handle_stdin(process, queue):
    """Handle stdin input from queue"""
    while True:
        try:
            input_data = queue.get()
            process.stdin.write(input_data + '\n')
            process.stdin.flush()
        except Exception as e:
            print(f"Error handling stdin: {e}")
            break

@app.route('/register/<plugin_id>')
def register_plugin(plugin_id):
    """Register a new plugin with its Python file"""
    file_path = request.args.get('file')
    if not file_path:
        return {'error': 'No file specified'}, 400
    
    try:
        # Get Python path from environment
        python_path = os.environ.get('PYTHON_PATH')
        if not python_path:
            return {'error': 'Python path not set'}, 500
        
        # Create process and start I/O threads
        process = create_process(plugin_id, python_path, file_path)
        
        # Start output relay threads
        threading.Thread(
            target=relay_output,
            args=(process, plugin_queues[plugin_id]['stdout'], 'stdout', plugin_id),
            daemon=True
        ).start()
        
        threading.Thread(
            target=relay_output,
            args=(process, plugin_queues[plugin_id]['stderr'], 'stderr', plugin_id),
            daemon=True
        ).start()
        
        # Start stdin handler thread
        threading.Thread(
            target=handle_stdin,
            args=(process, plugin_queues[plugin_id]['stdin']),
            daemon=True
        ).start()
        
        return {'status': 'success', 'message': f'Plugin {plugin_id} registered'}
    
    except Exception as e:
        return {'error': str(e)}, 500

@app.route('/fire/<plugin_id>', methods=['POST'])
def fire_function(plugin_id):
    """Execute a function in the plugin's process"""
    if plugin_id not in plugin_processes:
        return {'error': 'Plugin not registered'}, 404
    
    try:
        data = request.get_json()
        func_name = data.get('func')
        args = data.get('args', [])
        kwargs = data.get('kwargs', {})
        
        if not func_name:
            return {'error': 'No function specified'}, 400
        
        # Construct command to execute function
        cmd = {
            'type': 'execute',
            'func': func_name,
            'args': args,
            'kwargs': kwargs
        }
        
        # Send command to process
        plugin_queues[plugin_id]['stdin'].put(json.dumps(cmd))
        
        return {'status': 'success', 'message': f'Function {func_name} executed'}
    
    except Exception as e:
        return {'error': str(e)}, 500

@app.route('/subscribe/<plugin_id>/<stream_type>')
def subscribe_stream(plugin_id, stream_type):
    """Subscribe to plugin's stdout or stderr stream"""
    if plugin_id not in plugin_queues or stream_type not in ['stdout', 'stderr']:
        return {'error': 'Invalid plugin or stream type'}, 404
    
    def generate():
        queue = plugin_queues[plugin_id][stream_type]
        while True:
            try:
                line = queue.get()
                yield f"data: {line}\n\n"
            except Exception as e:
                print(f"Error in stream generation: {e}")
                break
    
    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream'
    )

@app.route('/subscribe/global/<stream_type>')
def subscribe_global(stream_type):
    """Subscribe to global stdout or stderr stream"""
    if stream_type not in ['stdout', 'stderr']:
        return {'error': 'Invalid stream type'}, 404
    
    def generate():
        queue = global_queues[stream_type]
        while True:
            try:
                line = queue.get()
                yield f"data: {line}\n\n"
            except Exception as e:
                print(f"Error in global stream generation: {e}")
                break
    
    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream'
    )

@app.route('/stdin/<plugin_id>', methods=['POST'])
def send_stdin(plugin_id):
    """Send input to plugin's stdin"""
    if plugin_id not in plugin_queues:
        return {'error': 'Plugin not registered'}, 404
    
    try:
        data = request.get_json()
        input_data = data.get('input')
        
        if input_data is None:
            return {'error': 'No input data provided'}, 400
        
        plugin_queues[plugin_id]['stdin'].put(input_data)
        return {'status': 'success', 'message': 'Input sent'}
    
    except Exception as e:
        return {'error': str(e)}, 500

@app.route('/health')
def health_check():
    """Health check endpoint"""
    return {'status': 'ok'}

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 41599))
    app.run(host='0.0.0.0', port=port)
