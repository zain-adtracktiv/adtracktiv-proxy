export async function createSession(
	client,
	sessionId,
	pseudoId,
	companyId,
	firstPageHref,
	firstPageHostname,
	firstPagePathname,
	referrerHref,
	referrerHostname,
	referrerPathname,
	city,
	country,
	region,
	deviceBrand,
	deviceModel,
	deviceType,
	deviceOs,
	deviceOsVersion,
	browser,
	browserVersion,
	utmCampaign,
	utmSource,
	utmMedium,
	utmContent,
	utmId,
	utmTerm
) {
	await client.query(
		`INSERT INTO session (id, pseudo_id, company_id, first_page_href, first_page_hostname, first_page_pathname, referrer_href, referrer_hostname, referrer_pathname, city, country, region, device_brand, device_model, device_type, device_os, device_os_version, browser, browser_version, utm_campaign, utm_source, utm_medium, utm_content, utm_id, utm_term) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`,
		[
			sessionId,
			pseudoId,
			companyId,

			firstPageHref,
			firstPageHostname,
			firstPagePathname,

			referrerHref,
			referrerHostname,
			referrerPathname,

			city,
			country,
			region,

			deviceBrand,
			deviceModel,
			deviceType,

			deviceOs,
			deviceOsVersion,
			browser,
			browserVersion,

			utmCampaign,
			utmSource,
			utmMedium,
			utmContent,
			utmId,
			utmTerm,
		]
	);
}
