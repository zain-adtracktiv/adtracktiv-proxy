export const deepMerge = (t, s) => {
	Object.keys(s).forEach((k) => {
		s[k] && typeof s[k] === 'object' ? (t[k] || (t[k] = {}), deepMerge(t[k], s[k])) : (t[k] = s[k]);
	});
	return t;
};

export function extractRootDomain(origin) {
	let noProtocol = origin.replace(/^https?:\/\//, '');
	noProtocol = noProtocol.endsWith('/') ? noProtocol.slice(0, -1) : noProtocol;
	let parts = noProtocol.split('.');
	if (parts.length > 2) {
		return parts.slice(1).join('.');
	} else {
		return noProtocol;
	}
}

export function removeNonAlphaChars(str) {
	return str.toLowerCase().replace(/[^a-z]/g, '');
}

export function removeNonAlphaAndNonNumericChars(str) {
	return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isValidUrl(string) {
	try {
		new URL(string);
		return true;
	} catch (e) {
		return false;
	}
}

export function isValidPseudo(pseudoId) {
	if (!pseudoId) return false;
	const pattern = /^\d{10}\.\d{13}$/;
	return pattern.test(pseudoId);
}

export function isValidSession(sessionId) {
	if (!sessionId) return false;
	// Regular expression to match the overall pattern
	const pattern = /^([A-Za-z0-9+/=]+)\.(\d{13})\.([A-Za-z0-9+/=]+)$/;

	const match = sessionId.match(pattern);

	if (!match) {
		return false;
	}

	const [, fingerprint, timestamp, urlParams] = match;

	// Check if fingerprint is valid base64 and decodes to an IP address
	try {
		if (atob(fingerprint).split('.').length !== 4) {
			return false;
		}
	} catch (e) {
		return false;
	}

	// Check if urlParams is valid base64 and decodes to a valid JSON object
	try {
		const decodedUrlParams = atob(urlParams);
		JSON.parse(decodedUrlParams);
	} catch (e) {
		return false;
	}

	return true;
}
