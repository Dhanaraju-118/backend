import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

console.log('Environment Variables:');
console.log('SQL_SERVER:', process.env.SQL_SERVER);
console.log('SQL_DATABASE:', process.env.SQL_DATABASE);
console.log('SQL_USERNAME:', process.env.SQL_USERNAME);
console.log('SQL_PASSWORD:', process.env.SQL_PASSWORD ? '****' : 'NOT SET');