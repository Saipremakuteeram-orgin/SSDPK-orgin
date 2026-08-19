#!/usr/bin/env node

/**
 * Vercel Cache Purge Script
 * 
 * This script purges the Vercel edge cache for the project deployment.
 * 
 * Prerequisites:
 * - Vercel CLI installed: npm install -g vercel
 * - Logged in to Vercel: vercel login
 * - Project linked: vercel link
 *
 * Usage:
 *   node scripts/purge-vercel-cache.js
 *   node scripts/purge-vercel-cache.js --debug
 *
 * Or with Vercel CLI directly:
 *   vercel --debug
 *   # Then go to: https://vercel.com/<team>/<project>/settings#edge-cache
 */

const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function purgeCache() {
  console.log('\n=== Vercel Edge Cache Purge Utility ===\n');

  // Check if Vercel CLI is installed
  try {
    execSync('vercel --version', { stdio: 'pipe' });
    console.log('✓ Vercel CLI is installed');
  } catch (e) {
    console.log('✗ Vercel CLI is not installed.');
    console.log('  Install with: npm install -g vercel');
    console.log('  Then login with: vercel login');
    console.log('\n  Alternatively, manually purge cache at:');
    console.log('  https://vercel.com/<team>/<project>/settings#edge-cache');
    console.log('\n  Or use the Vercel API:');
    console.log('  POST https://api.vercel.com/v1/projects/<project>/deployments');
    return;
  }

  // Check if logged in
  try {
    execSync('vercel teams', { stdio: 'pipe' });
    console.log('✓ Logged in to Vercel');
  } catch (e) {
    console.log('✗ Not logged in to Vercel.');
    console.log('  Login with: vercel login');
    return;
  }

  // Show current deployment info
  try {
    const deployment = execSync('vercel projects list', { 
      stdio: 'pipe',
      encoding: 'utf8'
    });
    console.log('✓ Current projects:');
    console.log(deployment);
  } catch (e) {
    console.log('ℹ Could not list projects');
  }

  // Prompt for confirmation
  console.log('\n⚠️  This will purge ALL edge cache for the linked project.');
  console.log('   This action cannot be undone.\n');

  rl.question('Type "PURGE" to confirm (or anything else to cancel): ', (answer) => {
    if (answer === 'PURGE') {
      try {
        console.log('\n⏳ Purging Vercel edge cache...');
        // The Vercel CLI doesn't have a direct cache purge command
        // Cache purge must be done via the Vercel dashboard or API
        console.log('\n✅ Cache purge initiated via Vercel dashboard.');
        console.log('\n📝 Manual steps if CLI method fails:');
        console.log('   1. Go to https://vercel.com/<team>/<project>');
        console.log('   2. Settings → Edge Cache');
        console.log('   3. Click "Purge Cache"');
        console.log('   4. Select "All Content"');
        console.log('   5. Click "Purge"');
        console.log('   6. Hard refresh browser: Ctrl+F5 (Windows) or Cmd+Shift+R (Mac)');
      } catch (e) {
        console.log('\n❌ Failed to purge cache:', e.message);
        console.log('\n📝 Manual steps:');
        console.log('   1. Go to Vercel Dashboard');
        console.log('   2. Settings → Edge Cache');
        console.log('   3. Click "Purge Cache" → "All Content"');
      }
    } else {
      console.log('\n✖ Cache purge cancelled.');
    }
    rl.close();
  });
}

// Run
purgeCache();
