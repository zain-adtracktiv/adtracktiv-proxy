import { Client } from '@neondatabase/serverless';
import { Router } from 'itty-router';
import { parse, serialize } from 'cookie';
import { deepMerge, extractRootDomain, isValidUrl, removeNonAlphaAndNonNumericChars, removeNonAlphaChars } from './utils';
import _ from 'lodash';
import { UAParser } from 'ua-parser-js';

const router = Router();

router.post('/e', async (request, env, ctx) => {
	//TODO authenticate request

	const requestClone = request.clone();
	const body = await request.json();
	let { city, region, country, postalCode } = request.cf;
	[city, region, country] = [city, region, country].map((value) => (value ? removeNonAlphaChars(value) : null));
	postalCode = postalCode ? removeNonAlphaAndNonNumericChars(postalCode) : null;

	if (!body.fromSdk) {
		// TODO next step include lifeforce webhooks, then also main site js
		return await env.ROUTER.fetch(requestClone);
	}

	console.log('From SDK');
	const uaParser = new UAParser(request.headers.get('user-agent'));
	const parsedUserAgent = uaParser.getResult();

	const client = new Client(env.DATABASE_URL);
	await client.connect();

	const cookie = parse(request.headers.get('Cookie') || '');

	const linker = cookie['_al'] || '';
	const [pseudoId, sessionId] = linker.split('*');

	const marketingParams = !!sessionId ? JSON.parse(atob(decodeURIComponent(sessionId).split('.')[2])) : {};

	const referrer = request.headers.get('referer');
	const referrerUrl = isValidUrl(referrer) ? new URL(referrer) : null;
	const referrerHref = referrerUrl?.href;
	const referrerHostname = referrerUrl?.hostname;
	const referrerPathname = referrerUrl?.pathname;

	for (const event of body.events) {
		const deviceWidth = event?.width ? event.width : null;
		const deviceHeight = event?.height ? event.height : null;

		// TODO: Check for rotator and variation applied
		// const isRotatorUrl = url?.pathname?.startsWith('/r/');

		const pageHref = event.location;
		const pageUrl = isValidUrl(pageHref) ? new URL(pageHref) : null;
		const pageHostname = pageUrl?.hostname;
		const pagePathname = pageUrl?.pathname;

		const firstPageUrl = isValidUrl(marketingParams.lp) ? new URL(marketingParams.lp) : null;
		const firstPageHref = firstPageUrl?.href;
		const firstPageHostname = firstPageUrl?.hostname;
		const firstPagePathname = firstPageUrl?.pathname;

		await client.query(
			`INSERT INTO event (name, company_id, pseudo_id, session_id, parameters, utm_campaign, utm_source, utm_medium, utm_content, utm_id, utm_term, first_page_href, first_page_hostname, first_page_pathname, page_href, page_hostname, page_pathname, referrer_href, referrer_hostname, referrer_pathname, city, region, country, postal_code, device_brand, device_model, device_type, device_width, device_height, device_os, device_os_version, browser, browser_version) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33)`,
			[
				event.eventName,
				event.companyId,
				pseudoId,
				sessionId,
				event.eventParameters,
				marketingParams.utm_campaign,
				marketingParams.utm_source,
				marketingParams.utm_medium,
				marketingParams.utm_content,
				marketingParams.utm_id,
				marketingParams.utm_term,
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
				parsedUserAgent.device.vendor,
				parsedUserAgent.device.model,
				parsedUserAgent.device.type,
				deviceWidth,
				deviceHeight,
				parsedUserAgent.os.name,
				parsedUserAgent.os.version,
				parsedUserAgent.browser.name,
				parsedUserAgent.browser.version,
				// hotlinks, experiments, variants, flags
			]
		);
	}

	ctx.waitUntil(client.end());

	return Response.json({
		success: true,
	});
});

router.get('/i', async (request, env, ctx) => {
	return await env.ROUTER.fetch(request);

	// return new Response('success');
});

router.patch('/i', async (request, env, ctx) => {
	const body = await request.json();

	const url = new URL(request.url);
	const urlParams = url.searchParams;

	const location = body.location;

	if (!location || !isValidUrl(location)) {
		console.log(`[${correlationId}] Bad Request: malformed h parameter in ${request.url}`);

		return new Response('Bad Request', {
			status: 400,
		});
	}

	const clientLocation = new URL(location);
	const hostname = request.headers.get('host');

	const rootHost = extractRootDomain(hostname);
	const clientRootHost = extractRootDomain(clientLocation.hostname);

	if (rootHost !== clientRootHost) {
		console.log(`[${correlationId}] Bad Request: not first party ${rootHost} !== ${clientRootHost}`);

		return new Response('Bad Request', {
			status: 400,
		});
	}

	const cookie = parse(request.headers.get('Cookie') || '');
	const cookieLinker = JSON.parse(cookie?.['al'] || '{}');

	const { pseudoId, sessionId, userIds } = cookieLinker.split('*');

	const setObject = body.set;
	const key = setObject.key;
	const value = setObject.value;

	let newLinker = '';

	if (key === 'urlParams') {
		let marketingParams = deepMerge(JSON.parse(atob(sessionId.split('.')[2])), value);
		const newSessionId = sessionId.split('.').slice(0, 2).join('.') + '.' + btoa(JSON.stringify(marketingParams));

		newLinker = pseudoId + '*' + newSessionId + '*' + userIds;
	} else if (key === 'user') {
		let userParams = deepMerge(JSON.parse(atob(userIds)), value);

		newLinker = pseudoId + '*' + sessionId + '*' + btoa(JSON.stringify(userParams));
	} else {
		console.log(`[${correlationId}] Bad Request: invalid key ${key}`);
		return new Response('Bad Request', {
			status: 400,
		});
	}

	let headers = {
		'Content-Type': 'application/javascript',
		'Cache-Control': 'max-age=3600',
		'Access-Control-Allow-Origin': clientLocation.origin,
	};

	if (newLinker) {
		const cookie = `_al=${newLinker}; HttpOnly; Secure; SameSite=Strict; Path=/; Domain=.${rootHost}; Max-Age=31536000;`;
		headers['Set-Cookie'] = cookie;
	}

	// Return the linker in the response body and set the cookie in the header
	const response = new Response(newLinker, {
		headers,
	});

	return response;
});

router.post('/decide', async (request, env, ctx) => {
	// TODO: Replace
	const value = await env.SDK_CONFIG.get('vip.trysnow.com');
	const experiences = JSON.parse(value);

	// Condition checking here
	const experience = experiences[0];

	return Response.json({
		redirectUrl: experience.url,
		variations: experience.flags,
		// hotLinkSlug,
		// pathwayId,
		// experimentId,
		// experimentVariantId,
	});
});

router.post('/pseudo-session', async (request, env, ctx) => {
	const body = await request.json();

	const client = new Client(env.DATABASE_URL);
	await client.connect();

	const firstPage = body.marketingParams.lp;
	const firstPageUrl = isValidUrl(firstPage) ? new URL(firstPage) : null;
	const firstPageHref = firstPageUrl?.href;
	const firstPageHostname = firstPageUrl?.hostname;
	const firstPagePathname = firstPageUrl?.pathname;

	const referrer = isValidUrl(body.referrer) ? new URL(body.referrer) : null;
	const referrerHref = referrer?.href;
	const referrerHostname = referrer?.hostname;
	const referrerPathname = referrer?.pathname;

	if (body.shouldCreatePseudo) {
		const trackedUserId = crypto.randomUUID();
		const timestamp = body.pseudoId.split('.')[1];

		await client.query(
			`INSERT INTO tracked_user (id,
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
			last_page_href,
			last_page_hostname,
			last_page_pathname)
		values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
			[
				trackedUserId,
				body.companyId,
				body.city,
				body.region,
				body.country,
				body.marketingParams.utm_campaign,
				body.marketingParams.utm_source,
				body.marketingParams.utm_medium,
				body.marketingParams.utm_content,
				body.marketingParams.utm_id,
				body.marketingParams.utm_term,
				body.marketingParams.utm_campaign,
				body.marketingParams.utm_source,
				body.marketingParams.utm_medium,
				body.marketingParams.utm_content,
				body.marketingParams.utm_id,
				body.marketingParams.utm_term,
				firstPageHref,
				firstPageHostname,
				firstPagePathname,
				firstPageHref,
				firstPageHostname,
				firstPagePathname,
			]
		);

		await client.query(`INSERT INTO pseudo (id, tracked_user_id, created_at) VALUES ($1, $2, TO_TIMESTAMP($3 / 1000.0))`, [
			body.pseudoId,
			trackedUserId,
			timestamp,
		]);
	}

	if (body.shouldCreateSession) {
		await client.query(
			`INSERT INTO session (id, pseudo_id, company_id, first_page_href, first_page_hostname, first_page_pathname, referrer_href, referrer_hostname, referrer_pathname, city, country, region, device_brand, device_model, device_type, device_os, device_os_version, browser, browser_version, utm_campaign, utm_source, utm_medium, utm_content, utm_id, utm_term) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`,
			[
				body.sessionId,
				body.pseudoId,
				body.companyId,
				firstPageHref,
				firstPageHostname,
				firstPagePathname,
				referrerHref,
				referrerHostname,
				referrerPathname,
				body.city,
				body.country,
				body.region,
				body.device.vendor,
				body.device.model,
				body.device.type,
				body.os.name,
				body.os.version,
				body.browser.name,
				body.browser.version,
				body.marketingParams.utm_campaign,
				body.marketingParams.utm_source,
				body.marketingParams.utm_medium,
				body.marketingParams.utm_content,
				body.marketingParams.utm_id,
				body.marketingParams.utm_term,
			]
		);
	}

	ctx.waitUntil(client.end());

	return Response.json({
		success: true,
	});
});

router.post('/reconcile-pseudo', async (request, env, ctx) => {
	const body = await request.json();

	const { allPseudos } = body;

	const client = new Client(env.DATABASE_URL);
	await client.connect();

	const { rows: trackedUsers } = await client.query(
		`
		SELECT
			pseudo.id AS "pseudoId",
			tracked_user.id AS "trackedUserId",
			tracked_user.email AS email
		FROM
			pseudo
			LEFT JOIN tracked_user ON pseudo.tracked_user_id = tracked_user.id
		WHERE
			pseudo.id IN($1, $2)
		ORDER BY
			tracked_user.created_at`,
		allPseudos
	);

	const trackedUsersByEmail = _.groupBy(trackedUsers, (trackedUser) => trackedUser.email);

	for (const email in trackedUsersByEmail) {
		const oldestTrackedUser = trackedUsersByEmail[email][0];

		trackedUsersByEmail[email].slice(1).forEach(async (trackedUser) => {
			await client.query(`UPDATE pseudo SET tracked_user_id = $1 WHERE id = $2`, [oldestTrackedUser.trackedUserId, trackedUser.pseudoId]);

			// CHECK: Update some fields before deleting the newer tracked user
			await client.query(`DELETE FROM tracked_user WHERE id = $1`, [trackedUser.trackedUserId]);
		});
	}

	ctx.waitUntil(client.end());

	return Response.json({
		success: true,
	});
});

router.all('/test', async (request, env) => {
	return await env.ROUTER.fetch(request);
	// return awaitnew Response(result);
	// new Response('Not Found', { status: 404 })
});

export default { ...router };
