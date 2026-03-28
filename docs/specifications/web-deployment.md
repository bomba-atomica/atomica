# GitHub Pages Deployment Guide

This document explains how to set up automatic deployment of the Atomica Call Auction simulator to GitHub Pages.

## Initial Setup

### 1. Enable GitHub Pages

1. Navigate to your repository on GitHub
2. Click **Settings** (in the repository toolbar)
3. In the left sidebar, click **Pages**
4. Under **Build and deployment**:
   - **Source**: Select **GitHub Actions**
   - This enables the custom GitHub Actions workflow

### 2. Verify Workflow Permissions

The workflow requires specific permissions that should be enabled by default, but verify:

1. Go to **Settings** → **Actions** → **General**
2. Scroll to **Workflow permissions**
3. Ensure **Read and write permissions** is selected
4. Check **Allow GitHub Actions to create and approve pull requests**

### 3. Deploy

The deployment will automatically trigger when:
- You push commits to the `main` branch that modify files in `source/web/`
- You manually trigger the workflow

## Automatic Deployment

The GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) will:

1. **Trigger** on push to `main` when `source/web/**` files change
2. **Build** by collecting all files in `source/web/`
3. **Deploy** to GitHub Pages

### Monitoring Deployment

1. Go to the **Actions** tab in your repository
2. Click on the latest **Deploy to GitHub Pages** workflow run
3. Watch the deployment progress
4. Once complete, the workflow will show the deployed URL

## Manual Deployment

To manually trigger a deployment:

1. Go to **Actions** tab
2. Click **Deploy to GitHub Pages** in the workflow list
3. Click **Run workflow** dropdown
4. Select the `main` branch
5. Click **Run workflow**

## Accessing Your Deployed Site

After successful deployment, your simulator will be available at:

```
https://<your-github-username>.github.io/<repository-name>/
```

For example:
- Username: `johndoe`
- Repository: `atomica`
- URL: `https://johndoe.github.io/atomica/`

## Workflow Configuration

The workflow file is located at `.github/workflows/deploy-pages.yml` and includes:

- **Trigger paths**: Only deploys when `source/web/**` changes
- **Concurrency control**: Prevents multiple simultaneous deployments
- **Artifact upload**: Packages the entire `source/web/` directory
- **GitHub Pages deployment**: Uses official GitHub Pages actions

## Troubleshooting

### Deployment Failed

1. Check the Actions tab for error messages
2. Verify that GitHub Pages is enabled in repository settings
3. Ensure the `source/web/` directory exists and contains `index.html`

### 404 Error After Deployment

1. Wait a few minutes for DNS propagation
2. Verify the deployment completed successfully in Actions
3. Check that you're accessing the correct URL

### Changes Not Appearing

1. Clear your browser cache
2. Try accessing in an incognito/private window
3. Verify the workflow ran after your latest commit
4. Check that your commit actually modified files in `source/web/`

## Custom Domain (Optional)

To use a custom domain:

1. Go to **Settings** → **Pages**
2. Under **Custom domain**, enter your domain (e.g., `auction.example.com`)
3. Add a CNAME file to `source/web/` with your domain:
   ```
   auction.example.com
   ```
4. Configure DNS records with your domain provider

## Security Considerations

- The simulator is a static site with no backend
- All computation happens client-side in the browser
- No sensitive data is transmitted or stored
- Safe to deploy publicly

## Updates

To update the deployed site:

1. Make changes to files in `source/web/`
2. Commit and push to `main`
3. GitHub Actions will automatically redeploy
4. Changes appear within 1-2 minutes

---

**Note**: This is a static site deployment. No server-side processing or database is involved. The entire application runs in the user's browser.
