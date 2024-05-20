import { Client } from '@neondatabase/serverless';
import { Router } from 'itty-router';
import { parse, serialize } from 'cookie';

// Create a new router
const router = Router();

// This will be replaced with the subdomain where the pages are hosted (e.g ain)
const REDIRECT_URL = 'https://www.marketintelgpt.com';

router.get('/r/*', async (request, env, ctx) => {
	const userId = 1;

	const url = new URL(request.url);
	const params = url.searchParams.toString();

	const client = new Client(env.DATABASE_URL);
	await client.connect();

	const {
		rows: [user],
	} = await client.query('SELECT * FROM test_user WHERE id = $1', [userId]);

	const cookie = `ae=${user.feature_flag ? 1 : 0}; HttpOnly; Secure; SameSite=None; Path=/; Domain=.marketintelgpt.com; Max-Age=31536000;`;

	const headers = {
		'Content-Type': 'application/javascript',
		'Cache-Control': 'max-age=3600',
		'Access-Control-Allow-Origin': '*',
		Cookie: cookie,
	};

	const rotatorName = url.pathname.split('/')[2];
	const {
		rows: [rotator],
	} = await client.query('SELECT * FROM rotator WHERE name = $1', [rotatorName]);

	let response = await fetch(`${REDIRECT_URL}/${rotator.url}${params ? `?${params}` : ''}`, {
		headers,
	});

	response = new Response(response.body, response);
	response.headers.append('Set-Cookie', cookie);

	ctx.waitUntil(client.end());
	return response;
});

router.post('/e', async (request, env, ctx) => {
	const body = await request.json();

	const client = new Client(env.DATABASE_URL);
	await client.connect();

	const cookie = parse(request.headers.get('Cookie') || '');

	const al = JSON.parse(cookie['al'] || '{}');
	const userId = al?.userId;

	for (const event of body) {
		const url = new URL(event.location);
		const isRotatorUrl = url.pathname.startsWith('/r/');

		// redirectUrl is the url to which the rotator redirects the user to
		let redirectUrl;
		if (isRotatorUrl) {
			redirectUrl = cookie['redirectUrl'];
		}

		const variations = JSON.parse(cookie['variations'] || '[]');
		const variation = variations ? variations.find((v) => v.url === (redirectUrl || event.location)) : null;

		await client.query(`INSERT INTO event (name, location, rotator_url, page_variation_name, user_id) VALUES ($1, $2, $3, $4, $5)`, [
			event.eventName,
			redirectUrl || event.location,
			redirectUrl && event.location,
			variation?.name,
			userId,
		]);
	}

	ctx.waitUntil(client.end());

	return Response.json({
		success: true,
	});
});

router.post('/i', async (request, env, ctx) => {
	const origin = request.headers.get('origin');
	const eventsConfig = await env.ADTRACKTIV.get('www.marketintelgpt.com'); // replace url with origin

	const cookie = parse(request.headers.get('Cookie') || '');
	const oldAl = JSON.parse(cookie?.['al'] || '{}');

	let userId = oldAl?.userId;
	if (!userId) {
		// also create user in database with this id
		// userId = crypto.randomUUID();
		userId = '3a26df84-cf3a-42d0-89fe-0a9619b65ba1';
	}

	const al = {
		userId,
		...oldAl,
	};

	const newCookie = serialize('al', JSON.stringify(al), {
		httpOnly: true,
	});

	const response = Response.json({
		success: true,
	});
	response.headers.append('Set-Cookie', newCookie);

	return response;
});

router.all('*', (request) => {
	const url = new URL(request.url);
	const params = url.searchParams.toString();

	return fetch(`${REDIRECT_URL}/${url.pathname}${params ? `?${params}` : ''}`);
});

export default { ...router };
