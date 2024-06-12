import { Client } from '@neondatabase/serverless';
import { Router } from 'itty-router';
import { parse, serialize } from 'cookie';
import { deepMerge, extractRootDomain } from './utils';
import _ from 'lodash';

// Create a new router
const router = Router();

router.post('/e', async (request, env, ctx) => {
	const body = await request.json();

	// TODO: Fill in user agent and geo fields
	// console.log(request.headers.get('user-agent'));
	// console.log(request.headers.get('X-Forwarded-For'));

	const client = new Client(env.DATABASE_URL);
	await client.connect();

	const cookie = parse(request.headers.get('Cookie') || '');

	const linker = cookie['_al'] || '';
	const [pseudoId, sessionId] = linker.split('*');

	const marketingParams = JSON.parse(atob(sessionId.split('.')[2]));

	const referrer = request.headers.get('referer');
	const referrerUrl = referrer ? new URL(referrer) : null;
	const referrerHostname = referrerUrl?.hostname;
	const referrerPathname = referrerUrl?.pathname;

	for (const event of body) {
		const url = event?.location ? new URL(event.location) : '';

		const isRotatorUrl = url?.pathname?.startsWith('/r/');
		// redirectUrl is the url to which the rotator redirects the user to
		let redirectUrl;

		const page = event.location || marketingParams.lp;
		const pageUrl = new URL(page);
		const hostname = pageUrl.hostname;
		const pathname = pageUrl.pathname;

		await client.query(
			`INSERT INTO event (name, company_id, pseudo_id, session_id, parameters, utm_campaign, utm_source, utm_medium, utm_content, utm_id, utm_term, page_href, page_hostname, page_pathname, referrer_href, referrer_hostname, referrer_pathname) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
			[
				event.eventName,
				event.companyId,
				pseudoId,
				sessionId,
				event.parameters,
				marketingParams.utm_campaign,
				marketingParams.utm_source,
				marketingParams.utm_medium,
				marketingParams.utm_content,
				marketingParams.utm_id,
				marketingParams.utm_term,
				page,
				hostname,
				pathname,
				referrer,
				referrerHostname,
				referrerPathname,
			]
		);
	}

	ctx.waitUntil(client.end());

	return Response.json({
		success: true,
	});
});

router.post('/i', async (request, env, ctx) => {
	const cookie = parse(request.headers.get('Cookie') || '');
	const oldAlValue = JSON.parse(cookie?.['al'] || '{}');

	let userId = oldAlValue?.userId;
	if (!userId) {
		// also create user in database with this id
		userId = crypto.randomUUID();
	}

	let sessionId = oldAlValue?.sessionId;
	if (!sessionId) {
		sessionId = crypto.randomUUID();
	}

	const timestamp = new Date().toISOString();

	const queryParams = JSON.stringify(request.query);

	const al = {
		...oldAlValue,
		userId,
		sessionId,
		timestamp,
		queryParams,
	};

	const newCookie = serialize('al', JSON.stringify(al), {
		httpOnly: true,
	});

	const response = Response.json({
		success: true,
	});
	response.headers.append('Set-Cookie', newCookie);
	response.headers.append('al', JSON.stringify(al));

	return response;
});

router.get('/i', async (request, env, ctx) => {
	return new Response.json({
		success: true,
	});
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
	const value = await env.ADTRACKTIV.get('vip.trysnow.com');
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
	const firstPageUrl = new URL(body.marketingParams.lp);
	const hostname = firstPageUrl.hostname;
	const pathname = firstPageUrl.pathname;

	const referrer = body.referrer ? new URL(body.referrer) : null;
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
				firstPage,
				hostname,
				pathname,
				firstPage,
				hostname,
				pathname,
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
				firstPage,
				hostname,
				pathname,
				body.referrer,
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

export default { ...router };
