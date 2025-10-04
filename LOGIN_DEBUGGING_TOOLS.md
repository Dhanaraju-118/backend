# AIVA Login Debugging Tools

This directory contains several tools to help debug and resolve login issues in the AIVA application.

## Tools Overview

### 1. `debug-login.js`
Analyzes common password/hash combinations to identify which ones match.

**Usage:**
```bash
node debug-login.js
```

### 2. `solution.js`
Provides step-by-step instructions to resolve login issues.

**Usage:**
```bash
node solution.js
```

### 3. `generate-user-hash.js`
Generates a bcrypt hash for a given password, which can be used to manually update user records in the database.

**Usage:**
```bash
node generate-user-hash.js <password>
```

**Example:**
```bash
node generate-user-hash.js password123
```

### 4. `verify-password.js`
Verifies if a password matches a given bcrypt hash.

**Usage:**
```bash
node verify-password.js <password> <hash>
```

**Example:**
```bash
node verify-password.js password123 '$2a$12$mv.FNFeffOlPPCrIWOX8aOQgS3LHLIrC44q/MV0dfMACEYxxJaWEW'
```

### 5. `fix-login.js`
Provides general information about the login issue and possible solutions.

**Usage:**
```bash
node fix-login.js
```

## Common Login Issues and Solutions

### Issue: "Invalid email or password" error
This is the most common issue and is typically caused by:

1. **Incorrect password**: Verify you're entering the correct password
2. **Password hash mismatch**: The hash stored in the database doesn't match the password
3. **User doesn't exist**: The email address doesn't match any user in the database

### Solution Steps:

1. **Create a new test user**:
   - Use the registration form in the web application
   - Register with:
     * Email: `test@example.com`
     * Password: `password123`
     * First Name: `Test`
     * Last Name: `User`

2. **Verify the password hash**:
   - Use `verify-password.js` to check if your password matches the stored hash
   - If it doesn't match, generate a new hash with `generate-user-hash.js` and update the database

3. **Check server logs**:
   - The updated authentication code now provides more detailed logging
   - Look for messages indicating why the login is failing

## Database User Management

### Creating Users
Always use the registration API or form to create users, as this ensures passwords are properly hashed.

### Manual User Creation
If you need to manually create a user in the database:

1. Generate a bcrypt hash for the password:
   ```bash
   node generate-user-hash.js yourpassword
   ```

2. Insert the user record with the generated hash:
   ```sql
   INSERT INTO Users (id, firstName, lastName, email, password, provider, role)
   VALUES ('user-id', 'First', 'Last', 'email@example.com', '<generated-hash>', 'local', 'user');
   ```

## Testing Credentials

### Default Test Users
The system has two default test users:

1. **Regular User**:
   - Email: `test@example.com`
   - Password: `password123`

2. **Admin User**:
   - Email: `admin@example.com`
   - Password: `admin123`

## Troubleshooting Tips

1. **Case Sensitivity**: Email addresses are case-sensitive in some database configurations
2. **Whitespace**: Ensure there's no extra whitespace in email or password fields
3. **Special Characters**: Some special characters might need to be escaped in certain contexts
4. **Database Connection**: Ensure the database is accessible and properly configured
5. **Server Status**: Make sure the backend server is running

## Additional Resources

- Check the main solution document: `LOGIN_ISSUE_SOLUTION.md`
- Review the authentication code in `src/routes/auth.ts`
- Check database configuration in `src/config/database.ts`