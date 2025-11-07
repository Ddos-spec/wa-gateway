import { sign } from 'jsonwebtoken';

// All problematic imports are disabled for this diagnostic test.

export default async (req, res) => {
  // Diagnostic Log: This is the primary goal of this test.
  console.log('DATABASE_URL received by Vercel function:', process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:([^:]+)@/, ':<password>@') : 'Not Set');

  const { username } = req.body || {};

  // FAKE LOGIN: Immediately return a success token for testing purposes.
  console.log(`!!! FAKE LOGIN SUCCESSFUL for user '${username}'. This is a diagnostic test. !!!`);
  const token = sign({ sub: 1, username: username || 'testuser' }, process.env.JWT_SECRET || 'secret', { expiresIn: '5m' });
  return res.status(200).json({ success: true, token });

  /* --- ORIGINAL CODE DISABLED FOR TESTING ---
  // The original code is commented out below to allow the function to run without crashing on module imports.
  ...
  */
};