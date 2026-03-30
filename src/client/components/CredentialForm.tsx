import type { Platform, ICredentials } from '@shared/types.js';

interface CredentialFormProps {
  platform: Platform;
  value: ICredentials;
  onChange: (creds: ICredentials) => void;
}

export default function CredentialForm({
  platform,
  value,
  onChange,
}: CredentialFormProps) {
  function set(field: keyof ICredentials, v: string) {
    onChange({ ...value, [field]: v });
  }

  const urlLabel = 'Store URL';

  const urlPlaceholder =
    platform === 'woocommerce'
      ? 'https://ecasnic.ro'
      : platform === 'shopify'
        ? 'https://my-store.myshopify.com'
        : platform === 'merchantpro'
          ? 'https://your-store.merchantpro.ro'
          : 'https://www.arlight.ro';

  const urlHint =
    platform === 'woocommerce'
      ? 'Just the store URL — /wp-json/wc/v3 is added automatically'
      : platform === 'gomag'
        ? 'Your store URL (e.g. https://www.arlight.ro)'
        : platform === 'merchantpro'
          ? 'Your MerchantPro store domain (e.g. https://your-store.merchantpro.ro)'
          : 'Your .myshopify.com store URL';

  const keyLabel =
    platform === 'woocommerce' ? 'Consumer Key' : 'API Key';

  return (
    <div className="space-y-4">
      {/* API / Store URL */}
      <label className="block">
        <span className="text-sm text-gray-400">{urlLabel}</span>
        <input
          type="url"
          required
          value={value.apiUrl}
          onChange={(e) => set('apiUrl', e.target.value)}
          placeholder={urlPlaceholder}
          className="mt-1 block w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
        <span className="text-xs text-gray-500 mt-1 block">{urlHint}</span>
      </label>

      {/* API Key / Consumer Key / Access Token */}
      <label className="block">
        <span className="text-sm text-gray-400">
          {platform === 'shopify' ? 'Access Token' : keyLabel}
        </span>
        <input
          type="password"
          required
          value={value.apiKey}
          onChange={(e) => set('apiKey', e.target.value)}
          className="mt-1 block w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
      </label>

      {/* Shopify setup help */}
      {platform === 'shopify' && (
        <div className="bg-blue-900/30 border border-blue-800 rounded px-3 py-2 text-xs text-blue-300">
          <strong>Need help?</strong> To get your Access Token, go to Shopify Admin →
          Settings → Apps → Develop apps → Create app → set{' '}
          <code className="bg-blue-900/50 px-1 rounded">read_orders</code> scope → Install
          → copy the Admin API access token.
        </div>
      )}

      {/* Consumer Secret / API Secret — WooCommerce & MerchantPro */}
      {(platform === 'woocommerce' || platform === 'merchantpro') && (
        <label className="block">
          <span className="text-sm text-gray-400">
            {platform === 'merchantpro' ? 'API Secret' : 'Consumer Secret'}
          </span>
          <input
            type="password"
            required
            value={value.apiSecret ?? ''}
            onChange={(e) => set('apiSecret', e.target.value)}
            className="mt-1 block w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
        </label>
      )}
    </div>
  );
}
