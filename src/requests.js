import { extractRootDomain } from './utils';

export async function verifyRequest(request) {
	const body = await request.json();

	const url = new URL(request.url);
	const urlParams = url.searchParams;

	const location = body.location;

	if (!location || !isValidUrl(location)) {
		console.log(`Bad Request: missing location in body from ${request.url}`);
		return new Response('Bad Request', {
			status: 400,
		});
	}

	const clientH = JSON.parse(urlParams.get('h'));
	if (clientH) {
		//service binding to cloudflare-tracking-router
	}

	const clientLocation = new URL(location);
	const hostname = request.headers.get('host');

	const rootHost = extractRootDomain(hostname);
	const clientRootHost = extractRootDomain(clientLocation.hostname);

	if (rootHost !== clientRootHost) {
		console.log(`Bad Request: not first party ${rootHost} !== ${clientRootHost}`);
		return new Response('Bad Request', {
			status: 400,
		});
	}

	return { clientLocation, rootHost, urlParams };
}
