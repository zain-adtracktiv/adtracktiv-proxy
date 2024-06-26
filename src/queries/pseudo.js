export async function createNewPseudo(
	client,
	pseudoId,
	companyId,
	city,
	region,
	country,
	utmCampaign,
	utmSource,
	utmMedium,
	utmContent,
	utmId,
	utmTerm,
	firstPageHref,
	firstPageHostname,
	firstPagePathname,
	firstReferrerHref,
	firstReferrerHostname,
	firstReferrerPathname
) {
	const trackedUserId = crypto.randomUUID();
	const timestamp = pseudoId.split('.')[1];

	await client.query(
		`INSERT INTO tracked_user (
            id,
			company_id,
			city,
			region,
			country,
			first_utm_campaign,
			first_utm_source,
			first_utm_medium,
			first_utm_content,
			first_utm_id,
			first_utm_term,
			last_utm_campaign,
			last_utm_source,
			last_utm_medium,
			last_utm_content,
			last_utm_id,
			last_utm_term,
			first_page_href,
			first_page_hostname,
			first_page_pathname,
			first_referrer_href,
			first_referrer_hostname,
			first_referrer_pathname,
			last_page_href,
			last_page_hostname,
			last_page_pathname)
		values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)`,
		[
			trackedUserId,
			companyId,
			city,
			region,
			country,

			utmCampaign,
			utmSource,
			utmMedium,
			utmContent,
			utmId,
			utmTerm,

			utmCampaign,
			utmSource,
			utmMedium,
			utmContent,
			utmId,
			utmTerm,

			firstPageHref,
			firstPageHostname,
			firstPagePathname,

			firstReferrerHref,
			firstReferrerHostname,
			firstReferrerPathname,

			firstPageHref,
			firstPageHostname,
			firstPagePathname,
		]
	);

	await client.query(`INSERT INTO pseudo (id, tracked_user_id, created_at) VALUES ($1, $2, TO_TIMESTAMP($3 / 1000.0))`, [
		pseudoId,
		trackedUserId,
		timestamp,
	]);
}
