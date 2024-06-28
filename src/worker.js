import { Client } from '@neondatabase/serverless';
import { Router } from 'itty-router';
import { parse, serialize } from 'cookie';
import {
	addCorsHeaders,
	deepMerge,
	extractRootDomain,
	get,
	hash,
	isValidPseudo,
	isValidSession,
	isValidUrl,
	removeNonAlphaAndNonNumericChars,
	removeNonAlphaChars,
} from './utils';
import _ from 'lodash';
import { UAParser } from 'ua-parser-js';
import { createSession } from './queries/session';
import { createNewPseudo } from './queries/pseudo';
import { createEvent } from './queries/event';

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
	let [pseudoId, sessionId] = linker.split('*');

	const variations = JSON.parse(cookie['variations'] || '{}');

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

		await createEvent(
			client,
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
			variations.hotLinkSlug,
			variations.pathwayId,
			variations.experimentId,
			variations.experimentVariantId
		);
	}

	ctx.waitUntil(client.end());

	return Response.json({
		success: true,
	});
});

// Endpoint that is called onEngage from the SDK or on init from the JS SDK
router.get('/i', async (request, env, ctx) => {
	const { searchParams } = new URL(request.url);

	const clientH = JSON.parse(searchParams.get('h') || '{}');
	if (clientH && isValidUrl(clientH.l)) {
		return await env.ROUTER.fetch(request);
	}

	const hostname = request.headers.get('host');
	const origin = request.headers.get('origin');

	const rootHost = extractRootDomain(hostname);
	const rootOrigin = extractRootDomain(origin);

	if (rootHost !== rootOrigin) {
		console.log(`Bad Request: not first party ${rootHost} !== ${rootOrigin}`);

		return new Response('Bad Request', {
			status: 400,
		});
	}

	if (request.method === 'OPTIONS') {
		return addCorsHeaders(new Response(null, { status: 204 }), origin);
	}

	const cookie = parse(request.headers.get('Cookie') || '');
	const linker = cookie['_al'] || '';

	const existingUserObj = get('userParams', linker);

	let headers;

	if (linker && (!existingUserObj?.ct || !existingUserObj?.st || !existingUserObj?.country)) {
		let { city, region, country } = request.cf;

		const newUserObj = {
			...existingUserObj,
			...(city && !existingUserObj?.ct && { ct: await hash(city.toLowerCase().replace(/[^a-z]/g, '')) }),
			...(country && !existingUserObj?.country && { country: await hash(country.toLowerCase().replace(/[^a-z]/g, '')) }),
			...(region &&
				!existingUserObj?.st && {
					st: await hash(region.toLowerCase().replace(/[^a-z]/g, '')),
				}),
		};

		const newLinker = `${linker.split('*')[0]}*${linker.split('*')[1]}*${btoa(JSON.stringify(newUserObj))}`;

		headers = {
			'Content-Type': 'application/javascript',
			'Cache-Control': 'max-age=3600',
		};

		if (newLinker) {
			const cookie = serialize('_al', newLinker, {
				httpOnly: true,
				secure: true,
				sameSite: 'strict',
				domain: `.${rootHost}`,
				maxAge: 31536000,
			});
			headers['Set-Cookie'] = cookie;
		}
	}

	const companyId = searchParams.get('companyId');

	const config = await env.SDK_CONFIG.get(companyId);

	const response = Response.json({ config }, { headers });
	return addCorsHeaders(response, origin);
});

router.patch('/i', async (request, env, ctx) => {
	const body = await request.json();
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
		const cookie = serialize('_al', newLinker, {
			httpOnly: true,
			secure: true,
			sameSite: 'strict',
			domain: `.${rootHost}`,
			maxAge: 31536000,
		});
		headers['Set-Cookie'] = cookie;
	}

	// Return the linker in the response body and set the cookie in the header
	const response = new Response(newLinker, {
		headers,
	});

	return response;
});

router.post('/decide', async (request, env, ctx) => {
	const body = await request.json();

	const value = await env.SDK_CONFIG.get(body.companyId);
	const experiences = JSON.parse(value ?? '{}');

	// Condition checking here
	const experience = experiences.pathways?.[0];

	return Response.json({
		experience,
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
		await createNewPseudo(
			client,
			body.pseudoId,
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
			firstPageHref,
			firstPageHostname,
			firstPagePathname,
			referrerHref,
			referrerHostname,
			referrerPathname
		);
	} else if (isValidPseudo(body.pseudoId)) {
		const existingPseudo = await client.query(`SELECT * FROM pseudo WHERE id = $1`, [body.pseudoId]);
		if (existingPseudo.rows.length === 0) {
			await createNewPseudo(
				client,
				body.pseudoId,
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
				firstPageHref,
				firstPageHostname,
				firstPagePathname,
				referrerHref,
				referrerHostname,
				referrerPathname
			);
		}
	}

	if (body.shouldCreateSession) {
		await createSession(
			client,
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
			body.variation?.hotLinkSlug,
			body.variation?.pathwayId,
			body.variation?.experimentId,
			body.variation?.experimentVariantId
		);

		await createEvent(
			client,
			'session_begin',
			body.companyId,
			body.pseudoId,
			body.sessionId,
			null,
			body.marketingParams.utm_campaign,
			body.marketingParams.utm_source,
			body.marketingParams.utm_medium,
			body.marketingParams.utm_content,
			body.marketingParams.utm_id,
			body.marketingParams.utm_term,
			firstPageHref,
			firstPageHostname,
			firstPagePathname,
			null,
			null,
			null,
			referrerHref,
			referrerHostname,
			referrerPathname,
			body.city,
			body.region,
			body.country,
			null,
			body.device.vendor,
			body.device.model,
			body.device.type,
			null,
			null,
			body.os.name,
			body.os.version,
			body.browser.name,
			body.browser.version
		);
	} else if (isValidSession(body.sessionId)) {
		const existingSession = await client.query(`SELECT * FROM session WHERE id = $1`, [body.sessionId]);
		if (existingSession.rows.length === 0) {
			await createSession(
				client,
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
				body.variation?.hotLinkSlug,
				body.variation?.pathwayId,
				body.variation?.experimentId,
				body.variation?.experimentVariantId
			);
		}
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

router.get('/hello', async (request, env, ctx) => {
	return new Response('Hello World!', {
		headers: {
			'content-type': 'text/plain',
		},
	});
});

router.all('/test', async (request, env) => {
	return await env.ROUTER.fetch(request);
	// return awaitnew Response(result);
	// new Response('Not Found', { status: 404 })
});

export default { ...router };
