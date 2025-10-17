# NPM 2FA Publishing Fix

## Problem
The release workflow fails with:
```
npm error 403 403 Forbidden - Two-factor authentication is required to publish this package but an automation token was specified
```

## Root Cause
The `@adobe/helix-deploy-plugin-edge` npm package has 2FA settings that **do not allow** automation tokens to publish, even though the workflow is using an automation token (`ADOBE_BOT_NPM_TOKEN`).

## Solution Required
An npm package maintainer with appropriate permissions needs to:

1. Go to https://www.npmjs.com/package/@adobe/helix-deploy-plugin-edge/access
2. Navigate to the package Settings tab
3. Change the 2FA setting from:
   - ❌ **"Require two-factor authentication for publishing"** (current)
   - ✅ **"Require maintainers to use 2FA or Automation Tokens"** (needed)

This package-level setting allows automation tokens to work with packages that have 2FA requirements, enabling CI/CD workflows to publish automatically.

## Code Changes Made
The `.releaserc.cjs` has been updated to enable npm provenance:
```javascript
["@semantic-release/npm", {
  "npmPublish": true,
  "npmProvenance": true
}]
```

This enables signed attestations for supply-chain security, but the package settings must also be updated for automated publishing to work.

## References
- [npm automation tokens](https://docs.npmjs.com/about-access-tokens#about-automation-tokens)
- [semantic-release/npm Issue #277](https://github.com/semantic-release/npm/issues/277)
- [changesets Issue #707](https://github.com/changesets/changesets/issues/707)
