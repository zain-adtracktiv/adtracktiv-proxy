import { getCookie } from '../lib/utils';

export async function handleInit(request, env, ctx) {
	const url = new URL(request.url);
	const params = url.searchParams;

	const cookies = request.headers.get('Cookie');
	const al = params.get('al') || getCookie(cookies, 'al') || Crypto.randomUUID();
}
