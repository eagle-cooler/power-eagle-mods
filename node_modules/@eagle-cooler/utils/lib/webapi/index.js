class EagleApi {
  static token = null;

  static async _internalGetToken() {
    if (EagleApi.token) {
      return EagleApi.token;
    }

    try {
      let res = await fetch('http://localhost:41595/api/application/info');
      if (!res) {
        throw new Error('No response from Eagle');
      }
      let raw = await res.json();
      let token = raw.data.preferences.developer.apiToken;
      if (token) {
        EagleApi.token = token;
        return token;
      }
    } catch (error) {
      console.error(error);
    }
    return null;
  }

  static async _internalRequest(path, methodname, data = null, params = null) {
    const token = await EagleApi._internalGetToken();
    if (!token) throw new Error('No token found');

    let url = `http://localhost:41595/api/${path}?token=${token}`;

    if (params) {
      params = Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== null)
      );
      url +=
        '&' +
        Object.entries(params)
          .map(([k, v]) => `${k}=${v}`)
          .join('&');
    }

    if (methodname === 'POST' && data) {
      data = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== null)
      );
    }

    try {
      const response = await fetch(
        url,
        methodname === 'POST'
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            }
          : undefined
      );

      const json = await response.json();
      return json.data;
    } catch (error) {
      console.error('Request failed:', error);
      throw error;
    }
  }

  static application = class {
    static info() {
      return EagleApi._internalRequest('application/info', 'GET');
    }
  };

  static folder = class {
    static create(name, parentId = null) {
      return EagleApi._internalRequest('folder/create', 'POST', {
        folderName: name,
        parent: parentId,
      }).then((data) => {
        return data;
      });
    }

    static rename(folderId, newName) {
      return EagleApi._internalRequest('folder/rename', 'POST', {
        folderId,
        newName,
      });
    }

    static update({
      folderId,
      newName = null,
      newDescription = null,
      newColor = null,
    }) {
      return EagleApi._internalRequest('folder/update', 'POST', {
        folderId,
        newName,
        newDescription,
        newColor,
      });
    }

    static list() {
      return EagleApi._internalRequest('folder/list', 'GET');
    }

    static listRecent() {
      return EagleApi._internalRequest('folder/listRecent', 'GET');
    }
  };

  static library = class {
    static info() {
      return EagleApi._internalRequest('library/info', 'GET');
    }

    static history() {
      return EagleApi._internalRequest('library/history', 'GET');
    }

    static switch(libraryPath) {
      return EagleApi._internalRequest('library/switch', 'POST', {
        libraryPath,
      });
    }

    static icon(libraryPath) {
      return EagleApi._internalRequest('library/icon', 'GET', null, {
        libraryPath,
      });
    }
  };

  static item = class {
    static update({
      itemId,
      tags = null,
      annotation = null,
      url = null,
      star = null,
    }) {
      return EagleApi._internalRequest('item/update', 'POST', {
        id: itemId,
        tags,
        annotation,
        url,
        star,
      });
    }

    static refreshThumbnail(itemId) {
      return EagleApi._internalRequest('item/refreshThumbnail', 'POST', {
        id: itemId,
      });
    }

    static refreshPalette(itemId) {
      return EagleApi._internalRequest('item/refreshPalette', 'POST', {
        id: itemId,
      });
    }

    static moveToTrash(itemIds) {
      return EagleApi._internalRequest('item/moveToTrash', 'POST', { itemIds });
    }

    static list({
      limit = 200,
      offset = 0,
      orderBy = null,
      keyword = null,
      ext = null,
      tags = null,
      folders = null,
    }) {
      return EagleApi._internalRequest('item/list', 'GET', null, {
        limit,
        offset,
        orderBy,
        keyword,
        ext,
        tags,
        folders,
      });
    }

    static getThumbnail(itemId) {
      return EagleApi._internalRequest('item/thumbnail', 'GET', null, {
        id: itemId,
      });
    }

    static getInfo(itemId) {
      return EagleApi._internalRequest('item/info', 'GET', null, {
        id: itemId,
      });
    }

    static addBookmark({
      url,
      name,
      base64 = null,
      tags = null,
      modificationTime = null,
      folderId = null,
    }) {
      return EagleApi._internalRequest('item/addBookmark', 'POST', {
        url,
        name,
        base64,
        tags,
        modificationTime,
        folderId,
      });
    }

    static addFromUrl({
      url,
      name,
      website = null,
      tags = null,
      star = null,
      annotation = null,
      modificationTime = null,
      folderId = null,
      headers = null,
    }) {
      return EagleApi._internalRequest('item/addFromUrl', 'POST', {
        url,
        name,
        website,
        tags,
        star,
        annotation,
        modificationTime,
        folderId,
        headers,
      });
    }

    static addFromPath({
      path,
      name,
      website = null,
      annotation = null,
      tags = null,
      folderId = null,
    }) {
      return EagleApi._internalRequest('item/addFromPath', 'POST', {
        path,
        name,
        website,
        annotation,
        tags,
        folderId,
      });
    }

    static addFromURLs({ items, folderId = null }) {
      return EagleApi._internalRequest('item/addFromURLs', 'POST', {
        items,
        folderId,
      });
    }
  };
}

export default EagleApi;
