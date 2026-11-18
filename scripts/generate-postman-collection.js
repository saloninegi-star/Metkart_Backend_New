const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const port = process.env.PORT || 3001;
const defaultBaseUrl = `http://localhost:${port}`;

const baseCollectionPath = path.join(__dirname, '..', 'docs', 'Metkart_Admin_Vendor.postman_collection.json');
const existingCol = JSON.parse(fs.readFileSync(baseCollectionPath, 'utf8'));

// Helper to create basic request object
function makeRequest({
  name,
  method,
  pathSegments,
  auth = { type: 'noauth' },
  headers = [],
  body = null,
  description = '',
  testScript = null,
  queryParams = null
}) {
  const urlObj = {
    raw: `{{baseUrl}}/${pathSegments.join('/')}${queryParams ? '?' + queryParams.map(q => `${q.key}=${q.value}`).join('&') : ''}`,
    host: ['{{baseUrl}}'],
    path: pathSegments
  };

  if (queryParams && queryParams.length > 0) {
    urlObj.query = queryParams;
  }

  const req = {
    name,
    request: {
      method,
      auth,
      header: headers,
      url: urlObj,
      description
    },
    response: []
  };

  if (body) {
    req.request.body = body;
  }

  if (testScript) {
    req.event = [
      {
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: Array.isArray(testScript) ? testScript : [testScript]
        }
      }
    ];
  }

  return req;
}

// 1. Health Folder
const healthFolder = {
  name: 'Health Check',
  item: [
    makeRequest({
      name: 'Server Health Check',
      method: 'GET',
      pathSegments: ['health'],
      description: 'Public health check endpoint returning server status ok.'
    })
  ]
};

// 2. User App - Authentication (OTP Based)
const userAuthFolder = {
  name: 'User App - Authentication (OTP)',
  item: [
    makeRequest({
      name: '1. Register User (Send OTP)',
      method: 'POST',
      pathSegments: ['api', 'user', 'auth', 'register'],
      headers: [{ key: 'Content-Type', value: 'application/json' }],
      body: {
        mode: 'raw',
        raw: JSON.stringify({
          fullName: 'Rahul Sharma',
          email: 'rahul@example.com',
          mobileNumber: '+919876543210',
          currentAddress: '123 Market Street, Sector 15, Gurgaon, Haryana'
        }, null, 2),
        options: { raw: { language: 'json' } }
      },
      description: 'Registers a new user profile with full name, email, mobile, and address. Sends a 6-digit OTP to the email. Account remains unverified until OTP verification.'
    }),
    makeRequest({
      name: '2. Login User (Send OTP)',
      method: 'POST',
      pathSegments: ['api', 'user', 'auth', 'login'],
      headers: [{ key: 'Content-Type', value: 'application/json' }],
      body: {
        mode: 'raw',
        raw: JSON.stringify({
          email: 'rahul@example.com'
        }, null, 2),
        options: { raw: { language: 'json' } }
      },
      description: 'Requests a login OTP for an existing verified user email.'
    }),
    makeRequest({
      name: '3. Verify OTP (Login & Register)',
      method: 'POST',
      pathSegments: ['api', 'user', 'auth', 'verify-otp'],
      headers: [{ key: 'Content-Type', value: 'application/json' }],
      body: {
        mode: 'raw',
        raw: JSON.stringify({
          email: 'rahul@example.com',
          otp: '123456'
        }, null, 2),
        options: { raw: { language: 'json' } }
      },
      description: 'Verifies the 6-digit email OTP. Automatically sets user to verified and returns JWT token and user info. Token is auto-saved as userToken and user._id as userId.',
      testScript: [
        'const body = pm.response.json();',
        'if (body.token) pm.environment.set("userToken", body.token);',
        'if (body.user && body.user._id) pm.environment.set("userId", body.user._id);'
      ]
    }),
    makeRequest({
      name: '4. Resend OTP',
      method: 'POST',
      pathSegments: ['api', 'user', 'auth', 'resend-otp'],
      headers: [{ key: 'Content-Type', value: 'application/json' }],
      body: {
        mode: 'raw',
        raw: JSON.stringify({
          email: 'rahul@example.com'
        }, null, 2),
        options: { raw: { language: 'json' } }
      },
      description: 'Generates and resends a new 6-digit verification OTP to the user email.'
    })
  ]
};

// 3. Orders Folder (All Order Routes Consolidated)
const userOrdersFolder = {
  name: 'Orders',
  item: [
    makeRequest({
      name: '1. Create Order',
      method: 'POST',
      pathSegments: ['api', 'user', 'orders'],
      auth: {
        type: 'bearer',
        bearer: [{ key: 'token', value: '{{userToken}}', type: 'string' }]
      },
      headers: [{ key: 'Content-Type', value: 'application/json' }],
      body: {
        mode: 'raw',
        raw: JSON.stringify({
          userId: '{{userId}}',
          productIds: [
            '{{productId}}'
          ]
        }, null, 2),
        options: { raw: { language: 'json' } }
      },
      description: 'Creates a pending order for the authenticated user. Body userId must match the authenticated user. All productIds must be published products with available quantity.',
      testScript: [
        'const body = pm.response.json();',
        'if (body.data && body.data._id) pm.environment.set("orderId", body.data._id);'
      ]
    }),
    makeRequest({
      name: '2. Get Orders by User ID',
      method: 'GET',
      pathSegments: ['api', 'user', 'orders', '{{userId}}'],
      auth: {
        type: 'noauth'
      },
      description: 'Retrieves all orders placed by the user using userId in URL params. Does NOT require authentication.'
    }),
    makeRequest({
      name: '3. Get Orders by Vendor ID',
      method: 'GET',
      pathSegments: ['api', 'user', 'orders', 'vendor', '{{vendorId}}'],
      auth: {
        type: 'noauth'
      },
      description: 'Retrieves all orders containing products belonging to the specified vendorId. Does NOT require admin token.'
    }),
    makeRequest({
      name: '4. Get All Orders (Admin)',
      method: 'GET',
      pathSegments: ['api', 'user', 'orders', 'all'],
      auth: {
        type: 'bearer',
        bearer: [{ key: 'token', value: '{{adminToken}}', type: 'string' }]
      },
      description: 'Retrieves all platform orders with optional pagination (page, limit) and status filtering. Requires Admin Bearer token.'
    })
  ]
};

// 4. Platform v1 - Auth & Role Endpoints
const platformV1Folder = {
  name: 'Platform v1 - Auth & Roles',
  item: [
    makeRequest({
      name: 'Register Account (v1 Core)',
      method: 'POST',
      pathSegments: ['api', 'v1', 'auth', 'register'],
      headers: [{ key: 'Content-Type', value: 'application/json' }],
      body: {
        mode: 'raw',
        raw: JSON.stringify({
          name: 'Asha Kumar',
          email: 'asha@example.com',
          password: 'ChangeMe123!',
          role: 'food'
        }, null, 2),
        options: { raw: { language: 'json' } }
      },
      description: 'Registers account for user-app roles (food, recycle, mechanic, grocery). Vendor and delivery accounts must be provisioned. Saves token as v1Token.',
      testScript: [
        'const body = pm.response.json();',
        'if (body.token) pm.environment.set("v1Token", body.token);'
      ]
    }),
    makeRequest({
      name: 'Login Account (v1 Core)',
      method: 'POST',
      pathSegments: ['api', 'v1', 'auth', 'login'],
      headers: [{ key: 'Content-Type', value: 'application/json' }],
      body: {
        mode: 'raw',
        raw: JSON.stringify({
          email: 'asha@example.com',
          password: 'ChangeMe123!'
        }, null, 2),
        options: { raw: { language: 'json' } }
      },
      description: 'Authenticates with email and password, returning JWT token. Saves token as v1Token.',
      testScript: [
        'const body = pm.response.json();',
        'if (body.token) pm.environment.set("v1Token", body.token);'
      ]
    }),
    makeRequest({
      name: 'Get Current Account (/accounts/me)',
      method: 'GET',
      pathSegments: ['api', 'v1', 'accounts', 'me'],
      auth: {
        type: 'bearer',
        bearer: [{ key: 'token', value: '{{v1Token}}', type: 'string' }]
      },
      description: 'Returns profile details for any authenticated account.'
    }),
    makeRequest({
      name: 'Get User-App Profile (/user-app/me)',
      method: 'GET',
      pathSegments: ['api', 'v1', 'user-app', 'me'],
      auth: {
        type: 'bearer',
        bearer: [{ key: 'token', value: '{{v1Token}}', type: 'string' }]
      },
      description: 'Authorized for accounts with roles: food, recycle, mechanic, or grocery.'
    }),
    makeRequest({
      name: 'Get Vendor Profile (/vendor/me)',
      method: 'GET',
      pathSegments: ['api', 'v1', 'vendor', 'me'],
      auth: {
        type: 'bearer',
        bearer: [{ key: 'token', value: '{{v1Token}}', type: 'string' }]
      },
      description: 'Legacy endpoint authorized only for accounts with vendor role.'
    }),
    makeRequest({
      name: 'Get Delivery Profile (/delivery/me)',
      method: 'GET',
      pathSegments: ['api', 'v1', 'delivery', 'me'],
      auth: {
        type: 'bearer',
        bearer: [{ key: 'token', value: '{{v1Token}}', type: 'string' }]
      },
      description: 'Authorized only for accounts with delivery_boy role.'
    })
  ]
};

// Also enrich existing Vendor Verify OTP request to save vendorId if returned
existingCol.item.forEach(folder => {
  if (folder.name === 'Vendor - OTP authentication') {
    folder.item.forEach(req => {
      if (req.name === 'Verify OTP and login') {
        req.event = [
          {
            listen: 'test',
            script: {
              type: 'text/javascript',
              exec: [
                'const body = pm.response.json();',
                'if (body.token) pm.environment.set("vendorToken", body.token);',
                'if (body.vendorId) pm.environment.set("vendorId", body.vendorId);'
              ]
            }
          }
        ];
      }
    });
  }
  if (folder.name === 'Vendor - Products') {
    folder.item.forEach(req => {
      if (req.name === 'Create product') {
        req.event = [
          {
            listen: 'test',
            script: {
              type: 'text/javascript',
              exec: [
                'const body = pm.response.json();',
                'if (body.data && body.data._id) pm.environment.set("productId", body.data._id);'
              ]
            }
          }
        ];
      }
    });
  }
});

// Build Complete Collection
const allItems = [
  healthFolder,
  userAuthFolder,
  userOrdersFolder,
  ...existingCol.item,
  platformV1Folder
];

const variables = [
  { key: 'baseUrl', value: defaultBaseUrl },
  { key: 'adminToken', value: '' },
  { key: 'vendorToken', value: '' },
  { key: 'userToken', value: '' },
  { key: 'v1Token', value: '' },
  { key: 'userId', value: '' },
  { key: 'productId', value: '' },
  { key: 'orderId', value: '' },
  { key: 'vendorId', value: '' },
  { key: 'onboardingType', value: 'shopkeeper' },
  { key: 'businessTypeId', value: '' },
  { key: 'shopTypeId', value: '' },
  { key: 'categoryId', value: '' },
  { key: 'id', value: '' },
  { key: 'filename', value: '' }
];

const completeCollection = {
  info: {
    _postman_id: crypto.randomUUID(),
    name: 'Metkart Complete API Collection',
    description: 'Complete, fully-featured Postman collection for all Metkart backend endpoints: Health, User App (OTP Auth & Orders), Admin (Auth, Shopkeeper, Vendor Settings, Onboarding Approvals), Vendor (OTP Auth, Dashboard, Profile, Onboarding, Products), and Platform v1 APIs.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  },
  auth: {
    type: 'noauth'
  },
  variable: variables,
  item: allItems
};

// Generate Postman Environment File
const environment = {
  id: crypto.randomUUID(),
  name: 'Metkart Local Environment',
  values: variables.map(v => ({
    key: v.key,
    value: v.value,
    type: ['adminToken', 'vendorToken', 'userToken', 'v1Token'].includes(v.key) ? 'secret' : 'default',
    enabled: true
  })),
  _postman_variable_scope: 'environment'
};

// Write outputs to docs and root
const docsColPath = path.join(__dirname, '..', 'docs', 'Metkart_Complete.postman_collection.json');
const docsEnvPath = path.join(__dirname, '..', 'docs', 'Metkart_Environment.postman_environment.json');
const rootColPath = path.join(__dirname, '..', '..', 'Metkart_Complete.postman_collection.json');
const rootEnvPath = path.join(__dirname, '..', '..', 'Metkart_Environment.postman_environment.json');

fs.writeFileSync(docsColPath, JSON.stringify(completeCollection, null, 2), 'utf8');
fs.writeFileSync(docsEnvPath, JSON.stringify(environment, null, 2), 'utf8');
fs.writeFileSync(rootColPath, JSON.stringify(completeCollection, null, 2), 'utf8');
fs.writeFileSync(rootEnvPath, JSON.stringify(environment, null, 2), 'utf8');

console.log('Successfully generated Postman Collection & Environment:');
console.log(' - ' + docsColPath);
console.log(' - ' + docsEnvPath);
console.log(' - ' + rootColPath);
console.log(' - ' + rootEnvPath);
console.log(`Total folders: ${completeCollection.item.length}`);
let totalReqs = 0;
completeCollection.item.forEach((f, idx) => {
  console.log(` ${idx + 1}. ${f.name} (${f.item.length} requests)`);
  totalReqs += f.item.length;
});
console.log(`Total endpoints/requests: ${totalReqs}`);
