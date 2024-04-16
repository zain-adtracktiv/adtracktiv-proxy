export function getCookie(headerCookies, cookieName) {
	if (!headerCookies) return null;

	const cookies = headerCookies.split('; ').map((cookie) => cookie.trim());
	const cookie = cookies.find((cookie) => cookie.startsWith(cookieName + '='));

	if (!cookie) return null;

	const separatorIndex = cookie.indexOf('=');
	const value = separatorIndex >= 0 ? cookie.substring(separatorIndex + 1) : null;
    
	return value || null;
}
