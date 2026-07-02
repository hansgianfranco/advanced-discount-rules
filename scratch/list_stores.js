const fs = require('fs');
const https = require('https');

// Read CLI config
const configPath = '/Users/whiz/Library/Preferences/shopify-cli-kit-nodejs/config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const currentSessionId = config.currentSessionId;
const session = JSON.parse(config.sessionStore).accounts['accounts.shopify.com'][currentSessionId];
const token = session.identity.accessToken;

console.log("Token acquired:", token.substring(0, 15) + "...");

const query = `
  query {
    organizations(first: 5) {
      nodes {
        id
        name
        stores(first: 50) {
          nodes {
            id
            shopName
            shopDomain
            transferDisabled
            convertableToPartnerDemo
          }
        }
      }
    }
  }
`;

const postData = JSON.stringify({ query });

const req = https.request({
  hostname: 'partners.shopify.com',
  path: '/api/cli/graphql',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': token,
    'User-Agent': 'Shopify CLI Kit'
  }
}, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log("Status Code:", res.statusCode);
    try {
      const response = JSON.parse(data);
      console.log(JSON.stringify(response, null, 2));
    } catch (e) {
      console.log("Response was not JSON:", data);
    }
  });
});

req.on('error', (e) => {
  console.error(e);
});

req.write(postData);
req.end();
