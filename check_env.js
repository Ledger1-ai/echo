const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '.env');
let envContent = '';

try {
    envContent = fs.readFileSync(envPath, 'utf8');
} catch (e) {
    console.log("Could not read .env file");
    process.exit(1);
}

const vars = {};
envContent.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key) vars[key.trim()] = val.join('=').trim();
});

const key = vars.THIRDWEB_ADMIN_PRIVATE_KEY || vars.ADMIN_PRIVATE_KEY;
const clientId = vars.NEXT_PUBLIC_THIRDWEB_CLIENT_ID;
const secret = vars.THIRDWEB_SECRET_KEY;

console.log("Admin Key Present:", !!key && key.length > 10);
console.log("Client ID Present:", !!clientId && clientId.length > 5);
console.log("Secret Key Present:", !!secret && secret.length > 10);
