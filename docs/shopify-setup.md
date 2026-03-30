# Shopify Setup Guide

How to create a Custom App in Shopify to get API access for order syncing.

## Steps

### 1. Access Shopify Admin
- Log in to your Shopify store admin panel: `https://your-store.myshopify.com/admin`

### 2. Enable Custom App Development
- Go to **Settings** > **Apps and sales channels**
- Click **Develop apps** (top-right)
- If prompted, click **Allow custom app development**

### 3. Create the App
- Click **Create an app**
- App name: `Clientorders Sync` (or any name)
- App developer: select your account
- Click **Create app**

### 4. Configure API Scopes
- Go to the **Configuration** tab
- Under **Admin API integration**, click **Configure**
- Search for and select: **`read_orders`**
- Click **Save**

### 5. Install the App
- Go to the **API credentials** tab
- Click **Install app** (top-right)
- Confirm the installation in the dialog

### 6. Copy the Access Token
- After installation, the **Admin API access token** is shown
- **Copy it immediately** — it is shown only once!
- If lost, you need to uninstall and reinstall the app

### 7. Configure in Clientorders
In the Clientorders app, add a new site with:

| Field | Value |
|-------|-------|
| Platform | **Shopify** |
| Store URL | `https://your-store.myshopify.com` |
| Access Token | The token from Step 6 |

## Important Notes

- The access token has **no expiration date** — it works until the app is uninstalled
- Shopify has rate limits: **2 requests/second** (bucket with leak)
- The app only needs `read_orders` scope — it cannot modify anything in your store
- If you need to regenerate the token, uninstall the app and reinstall it
