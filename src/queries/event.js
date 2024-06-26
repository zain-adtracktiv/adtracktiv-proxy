export async function createEvent(
	client,
	name,
	companyId,
	pseudoId,
	sessionId,
	parameters,
	utmCampaign,
	utmSource,
	utmMedium,
	utmContent,
	utmId,
	utmTerm,
	firstPageHref,
	firstPageHostname,
	firstPagePathname,
	pageHref,
	pageHostname,
	pagePathname,
	referrerHref,
	referrerHostname,
	referrerPathname,
	city,
	region,
	country,
	postalCode,
	deviceBrand,
	deviceModel,
	deviceType,
	deviceWidth,
	deviceHeight,
	deviceOs,
	deviceOsVersion,
	browser,
	browserVersion
) {
	await client.query(
		`INSERT INTO event (name, company_id, pseudo_id, session_id, parameters, utm_campaign, utm_source, utm_medium, utm_content, utm_id, utm_term, first_page_href, first_page_hostname, first_page_pathname, page_href, page_hostname, page_pathname, referrer_href, referrer_hostname, referrer_pathname, city, region, country, postal_code, device_brand, device_model, device_type, device_width, device_height, device_os, device_os_version, browser, browser_version) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33)`,
		[
			name,
			companyId,
			pseudoId,
			sessionId,
			parameters,

			utmCampaign,
			utmSource,
			utmMedium,
			utmContent,
			utmId,
			utmTerm,

			firstPageHref,
			firstPageHostname,
			firstPagePathname,

			pageHref,
			pageHostname,
			pagePathname,

			referrerHref,
			referrerHostname,
			referrerPathname,

			city,
			region,
			country,
			postalCode,

			deviceBrand,
			deviceModel,
			deviceType,
			deviceWidth,
			deviceHeight,

			deviceOs,
			deviceOsVersion,

			browser,
			browserVersion,
			// hotlinks, experiments, variants, flags
		]
	);
}
