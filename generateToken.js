import { getAuthUrl, getTokensFromCode } from './utils/googleDrive.js';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const generateToken = async () => {
  const url = getAuthUrl();
  console.log('\n1. Open this URL in your browser:\n', url);
  
  rl.question('\n2. Paste the authorization code here: ', async (code) => {
    try {
      const tokens = await getTokensFromCode(code);
      console.log('\nSuccess! New Refresh Token:\n');
      console.log(tokens.refresh_token);
      console.log('\nCopy this token and update GOOGLE_REFRESH_TOKEN in your .env file.');
    } catch (err) {
      console.error('\nError exchanging code for tokens:', err.message);
    } finally {
      rl.close();
    }
  });
};

generateToken();
