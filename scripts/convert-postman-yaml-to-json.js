/**
 * scripts/convert-postman-yaml-to-json.js
 *
 * Converts Postman v3 YAML folder structure (postman/collections/<CollectionName>)
 * into standard Postman Collection v2.1.0 (.json) format.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

function parseUrl(rawUrl) {
  if (!rawUrl) {
    return {
      raw: '',
      host: ['{{baseUrl}}'],
      path: []
    };
  }

  // Split query string if any
  const [basePart, queryString] = rawUrl.split('?');
  
  let host = [];
  let pathSegments = [];

  if (basePart.startsWith('{{baseUrl}}')) {
    host = ['{{baseUrl}}'];
    const remaining = basePart.slice('{{baseUrl}}'.length).replace(/^\/+/, '');
    if (remaining.length > 0) {
      pathSegments = remaining.split('/');
    }
  } else if (basePart.startsWith('http://') || basePart.startsWith('https://')) {
    try {
      const urlObj = new URL(basePart);
      host = urlObj.host.split('.');
      pathSegments = urlObj.pathname.split('/').filter(Boolean);
    } catch {
      pathSegments = basePart.split('/').filter(Boolean);
    }
  } else {
    pathSegments = basePart.split('/').filter(Boolean);
  }

  const result = {
    raw: rawUrl,
    host: host.length > 0 ? host : ['{{baseUrl}}'],
    path: pathSegments
  };

  if (queryString) {
    result.query = queryString.split('&').map(pair => {
      const eqIdx = pair.indexOf('=');
      if (eqIdx !== -1) {
        return {
          key: decodeURIComponent(pair.slice(0, eqIdx)),
          value: decodeURIComponent(pair.slice(eqIdx + 1))
        };
      }
      return {
        key: decodeURIComponent(pair),
        value: ''
      };
    });
  }

  // Check for path variables (e.g., :id or :storageKey)
  const pathVars = pathSegments.filter(s => s.startsWith(':'));
  if (pathVars.length > 0) {
    result.variable = pathVars.map(pv => ({
      key: pv.slice(1),
      value: ''
    }));
  }

  return result;
}

function convertRequest(reqDoc, fileName) {
  const reqName = reqDoc.name || fileName.replace(/\.request\.yaml$/, '');
  
  // Headers
  const headerList = [];
  if (reqDoc.headers && typeof reqDoc.headers === 'object') {
    for (const [k, v] of Object.entries(reqDoc.headers)) {
      headerList.push({
        key: k,
        value: String(v)
      });
    }
  }

  // Auth
  let auth = undefined;
  if (reqDoc.auth) {
    if (reqDoc.auth.type === 'bearer') {
      const tokenVal = reqDoc.auth.credentials?.token || '{{token}}';
      auth = {
        type: 'bearer',
        bearer: [
          {
            key: 'token',
            value: tokenVal,
            type: 'string'
          }
        ]
      };
    } else if (reqDoc.auth.type === 'noauth') {
      auth = {
        type: 'noauth'
      };
    }
  }

  // Body
  let body = undefined;
  if (reqDoc.body) {
    if (reqDoc.body.type === 'json' || reqDoc.body.type === 'text') {
      body = {
        mode: 'raw',
        raw: typeof reqDoc.body.content === 'string' 
          ? reqDoc.body.content 
          : JSON.stringify(reqDoc.body.content, null, 2),
        options: {
          raw: {
            language: reqDoc.body.type === 'json' ? 'json' : 'text'
          }
        }
      };
      // Ensure Content-Type header if json
      if (reqDoc.body.type === 'json' && !headerList.some(h => h.key.toLowerCase() === 'content-type')) {
        headerList.unshift({
          key: 'Content-Type',
          value: 'application/json'
        });
      }
    } else if (reqDoc.body.type === 'formdata') {
      const formdata = (reqDoc.body.content || []).map(item => {
        if (item.type === 'file') {
          return {
            key: item.key,
            type: 'file',
            src: Array.isArray(item.src) ? item.src : (item.src ? [item.src] : []),
            description: item.description
          };
        }
        return {
          key: item.key,
          value: item.value !== undefined ? String(item.value) : '',
          type: 'text',
          disabled: Boolean(item.disabled)
        };
      });
      body = {
        mode: 'formdata',
        formdata
      };
    }
  }

  const url = parseUrl(reqDoc.url);

  const postmanItem = {
    name: reqName,
    request: {
      method: reqDoc.method || 'GET',
      header: headerList,
      url
    }
  };

  if (auth) {
    postmanItem.request.auth = auth;
  }
  if (body) {
    postmanItem.request.body = body;
  }
  if (reqDoc.description) {
    postmanItem.request.description = reqDoc.description;
  }

  return postmanItem;
}

function processFolder(folderPath) {
  const items = fs.readdirSync(folderPath);
  
  // Read folder definition.yaml if exists
  let folderDef = null;
  const defPath = path.join(folderPath, '.resources', 'definition.yaml');
  if (fs.existsSync(defPath)) {
    try {
      folderDef = yaml.parse(fs.readFileSync(defPath, 'utf8'));
    } catch {}
  }

  const folderName = (folderDef && folderDef.name) 
    ? folderDef.name.replace(/\?/g, '-')
    : path.basename(folderPath);

  const entriesWithOrder = [];

  for (const item of items) {
    if (item === '.resources') continue;
    const fullPath = path.join(folderPath, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      const subFolder = processFolder(fullPath);
      // Get order of subfolder from its definition.yaml if any
      let order = 999999;
      const subDef = path.join(fullPath, '.resources', 'definition.yaml');
      if (fs.existsSync(subDef)) {
        try {
          const d = yaml.parse(fs.readFileSync(subDef, 'utf8'));
          if (d && typeof d.order === 'number') order = d.order;
        } catch {}
      }
      entriesWithOrder.push({ order, item: subFolder });
    } else if (item.endsWith('.request.yaml')) {
      // Ignore placeholder/empty request files without URL
      try {
        const doc = yaml.parse(fs.readFileSync(fullPath, 'utf8'));
        if (!doc.url && !doc.name && (!doc.method || doc.method === 'GET')) {
          // Check if truly empty placeholder
          if (fs.statSync(fullPath).size < 100) continue;
        }
        const postmanReq = convertRequest(doc, item);
        const order = typeof doc.order === 'number' ? doc.order : 999999;
        entriesWithOrder.push({ order, item: postmanReq });
      } catch (err) {
        console.error(`Error parsing request file ${fullPath}:`, err.message);
      }
    }
  }

  entriesWithOrder.sort((a, b) => a.order - b.order);

  const folderObj = {
    name: folderName,
    item: entriesWithOrder.map(e => e.item)
  };

  if (folderDef && folderDef.description) {
    folderObj.description = folderDef.description;
  }

  return folderObj;
}

function generateCollection(collectionDir, outputPath) {
  console.log(`Processing collection directory: ${collectionDir}`);
  const colDefPath = path.join(collectionDir, '.resources', 'definition.yaml');
  let colDef = {};
  if (fs.existsSync(colDefPath)) {
    try {
      colDef = yaml.parse(fs.readFileSync(colDefPath, 'utf8')) || {};
    } catch (e) {
      console.error(`Error parsing collection definition:`, e.message);
    }
  }

  const colName = colDef.name || path.basename(collectionDir);
  const colDescription = colDef.description || '';
  
  // Format variables
  const variables = [];
  if (Array.isArray(colDef.variables)) {
    for (const v of colDef.variables) {
      if (v.key) {
        variables.push({
          key: v.key,
          value: v.value !== undefined ? String(v.value) : '',
          type: v.secret ? 'secret' : 'string',
          disabled: Boolean(v.disabled)
        });
      }
    }
  }

  const rootItems = fs.readdirSync(collectionDir);
  const entriesWithOrder = [];

  for (const item of rootItems) {
    if (item === '.resources') continue;
    const fullPath = path.join(collectionDir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      const folderObj = processFolder(fullPath);
      let order = 999999;
      const subDef = path.join(fullPath, '.resources', 'definition.yaml');
      if (fs.existsSync(subDef)) {
        try {
          const d = yaml.parse(fs.readFileSync(subDef, 'utf8'));
          if (d && typeof d.order === 'number') order = d.order;
        } catch {}
      }
      entriesWithOrder.push({ order, item: folderObj });
    } else if (item.endsWith('.request.yaml')) {
      try {
        const doc = yaml.parse(fs.readFileSync(fullPath, 'utf8'));
        if (!doc.url && !doc.name && fs.statSync(fullPath).size < 100) continue;
        const postmanReq = convertRequest(doc, item);
        const order = typeof doc.order === 'number' ? doc.order : 999999;
        entriesWithOrder.push({ order, item: postmanReq });
      } catch (err) {
        console.error(`Error parsing request file ${fullPath}:`, err.message);
      }
    }
  }

  entriesWithOrder.sort((a, b) => a.order - b.order);

  const collectionJson = {
    info: {
      _postman_id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: colName,
      description: colDescription,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: entriesWithOrder.map(e => e.item),
    variable: variables
  };

  const jsonStr = JSON.stringify(collectionJson, null, 2);
  fs.writeFileSync(outputPath, jsonStr, 'utf8');
  console.log(`Generated: ${outputPath} (${entriesWithOrder.length} top-level folders/items, ${(Buffer.byteLength(jsonStr) / 1024).toFixed(1)} KB)`);
  return collectionJson;
}

module.exports = {
  generateCollection
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const targetName = args[0] || 'DatingApp API';
  const outFileName = args[1] || `${targetName.replace(/\s+/g, '_')}.postman_collection.json`;
  
  const colDir = path.resolve(process.cwd(), 'postman', 'collections', targetName);
  const outPath = path.resolve(process.cwd(), 'docs', outFileName);

  if (!fs.existsSync(colDir)) {
    console.error(`Collection folder not found: ${colDir}`);
    process.exit(1);
  }

  generateCollection(colDir, outPath);
}
