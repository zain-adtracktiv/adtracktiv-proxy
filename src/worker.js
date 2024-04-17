import { parse } from 'cookie';
import { Client } from '@neondatabase/serverless';

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const params = url.searchParams.toString();

		const REDIRECT_URL = 'https://www.marketintelgpt.com';

		const matcher = /^\/(api|_next\/static|_next\/image|favicon\.ico).*/;
		if (matcher.test(url.pathname)) {
			// We can handle assets and API routes here
			return fetch(`${REDIRECT_URL}/${url.pathname}${params ? `?${params}` : ''}`);
		}

		const client = new Client(env.DATABASE_URL);
		await client.connect();

		const userId = 1;

		const {
			rows: [user],
		} = await client.query('SELECT * FROM test_user WHERE id = $1', [userId]);

		const cookie = `ae=${
			user.feature_flag ? 1 : 0
		}; HttpOnly; Secure; SameSite=None; Path=/; Domain=.marketintelgpt.com; Max-Age=31536000;`;

		const headers = {
			'Content-Type': 'application/javascript',
			'Cache-Control': 'max-age=3600',
			'Access-Control-Allow-Origin': '*',
			Cookie: cookie,
		};

		if (url.pathname.startsWith('/r/')) {
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
		}

		// Retreive user info from cookie

		let response = await fetch(`${REDIRECT_URL}/${url.pathname}`, {
			headers,
		});
		response = new Response(response.body, response);
		// Set cookie to enable persistent A/B sessions.
		response.headers.append('Set-Cookie', cookie);

		ctx.waitUntil(client.end());
		return response;
	},
};
