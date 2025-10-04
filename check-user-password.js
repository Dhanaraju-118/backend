const sql = require('mssql');

// Database configuration from environment variables
const config = {
  user: 'aivadbadmin',
  password: 'ravi@0791',
  server: 'aivaserver.database.windows.net',
  database: 'aivadb',
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

async function checkUserPassword() {
  try {
    console.log('Connecting to database...');
    await sql.connect(config);
    console.log('Connected successfully!');
    
    console.log('Checking user password...');
    const result = await sql.query`SELECT id, email, password, role, firstName, lastName, isActive FROM Users WHERE email = 'sudhenreddym@gmail.com'`;
    
    if (result.recordset.length > 0) {
      const user = result.recordset[0];
      console.log('✅ User found:');
      console.log('  ID:', user.id);
      console.log('  Email:', user.email);
      console.log('  Role:', user.role);
      console.log('  Name:', user.firstName, user.lastName);
      console.log('  Active:', user.isActive ? 'Yes' : 'No');
      console.log('  Password hash:', user.password);
    } else {
      console.log('❌ User not found in database');
    }
    
    await sql.close();
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkUserPassword();