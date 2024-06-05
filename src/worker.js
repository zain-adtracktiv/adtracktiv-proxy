import { Client } from '@neondatabase/serverless';
import { Router } from 'itty-router';
import { parse, serialize } from 'cookie';
import { deepMerge, extractRootDomain } from './utils';

// Create a new router
const router = Router();

// This will be replaced with the subdomain where the pages are hosted (e.g ain)
const REDIRECT_URL = 'https://www.marketintelgpt.com';

router.post('/e', async (request, env, ctx) => {
	const body = await request.json();

	const client = new Client(env.DATABASE_URL);
	await client.connect();

	const cookie = parse(request.headers.get('Cookie') || '');

	const al = JSON.parse(cookie['al'] || '{}');
	const userId = al?.userId;

	for (const event of body) {
		const url = event?.location ? new URL(event.location) : '';
		const isRotatorUrl = url?.pathname?.startsWith('/r/');

		// redirectUrl is the url to which the rotator redirects the user to
		let redirectUrl;
		if (isRotatorUrl) {
			redirectUrl = cookie['redirectUrl'];
		}

		const variations = JSON.parse(cookie['variations'] || null);

		await client.query(`INSERT INTO event (name, location, rotator_url, page_variation_name, user_id) VALUES ($1, $2, $3, $4, $5)`, [
			event.eventName,
			redirectUrl || event.location,
			redirectUrl && event.location,
			variations,
			userId,
		]);
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
	});
});

router.all('*', (request) => {
	const url = new URL(request.url);
	const params = url.searchParams.toString();

	return fetch(`${REDIRECT_URL}/${url.pathname}${params ? `?${params}` : ''}`);
});

export default { ...router };
