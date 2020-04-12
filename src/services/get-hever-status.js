import HTMLParser from 'fast-html-parser';

const baseUrl = 'https://www.hvr.co.il';
const IGNORED_COOKIES = ['path', 'secure', 'samesite'];

const splitSingleHeaderValue = pair => {
    const split = pair.split('=');
    split[0] = split[0].trim();

    return split;
};

const parseHeaderValues = headerString => (headerString || '')
    .split(/;|,\s/)
    .map(splitSingleHeaderValue)
    .filter(([_, value]) => !!value)
    .reduce((all, [name, value]) => ({...all, [name]: value}), {}) || {};

const getInitialCookies = async () => {
    const response = await fetch(`${baseUrl}/signin.aspx`, {credentials: 'omit'});

    return parseHeaderValues(response.headers.get('set-cookie'));
};

const getEntertainmentPage = async cookies => {
    const options = {
        credentials: 'omit',
        headers: {
            ...buildCookieHeader(cookies)
        }
    };

    // TODO: Get the link from the text
    const response = await fetch(`${baseUrl}/home_page.aspx?page=mcc_item,266006`, options);
    const content = await readEncodedContent(response);

    return HTMLParser.parse(content);
};

const hasNoShowsMessage = pageDom => {
    return true;
    // TODO: Complete work here
    //return pageDom.includes("NO SHOWS");
};

const buildCookieHeader = cookies => ({Cookie: Object.keys(cookies)
    .filter(cookieName => !IGNORED_COOKIES.includes(cookieName.toLowerCase()))
    .map(cookieName => `${cookieName}=${cookies[cookieName]}`)
    .join(';')});

const getCN = async cookies => {
    const options = {
        credentials: 'omit',
        headers: {
            ...buildCookieHeader(cookies)
        }
    };

    const basicPageResponse = await fetch(`${baseUrl}/signin.aspx`, options);
    const basicPageContent = await readEncodedContent(basicPageResponse);

    const basicPageDom = HTMLParser.parse(basicPageContent);

    const cn =  basicPageDom.querySelectorAll('input')
        .find(x => x.attributes?.name === 'cn')
        ?.attributes
        .value;

    if (!cn) {
        throw new Error('Cannot find CN in base document');
    }

    return cn;
};

const promisifyFileReader = reader =>
    new Promise((resolve, reject) => {
        reader.onload = function () {
            resolve(reader.result);
        };

        reader.onerror = function () {
            reject(reader.error);
        };
    });

const readBlob = (blob, encoding) => {
    const reader = new FileReader();
    const promise = promisifyFileReader(reader);

    reader.readAsText(blob, encoding);

    return promise;
};

const readEncodedContent = async response => {
    const encoding = parseHeaderValues(response.headers.get('content-type'))['charset'] || 'windows-1255';
    const blob = await response.blob();

    return await readBlob(blob, encoding);
};

// TODO: Config the credentials
const buildLoginParams = cn => ({
    cn,
    tz: '',
    password: '',
    oMode: 'login',
});

const buildLoginHeaders = cookies => ({
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: '*/*',
    ...buildCookieHeader(cookies)
});

const login = async cookies => {
    const SUCCESS_TEXT = 'Ok...';

    const url = `${baseUrl}/signin.aspx`;
    const cn = await getCN(cookies);

    const loginParams = buildLoginParams(cn);
    const headers = buildLoginHeaders(cookies);
    const options = {
        method: 'POST',
        credentials: 'omit',
        body: new URLSearchParams(loginParams).toString(),
        headers
    };

    const loginResponse = await fetch(url, options);
    const content = await readEncodedContent(loginResponse);

    if (content !== SUCCESS_TEXT) {
        throw new Error(`Login failed: ${content}`)
    }

    return parseHeaderValues(loginResponse.headers.get('set-cookie'));
};

export const isEntertainmentAvailable = async () => {
    const cookies = await getInitialCookies();
    const newCookies = await login(cookies);

    debugger;
    Object.assign(cookies, newCookies);

    const pageDom = await getEntertainmentPage(cookies);

    return !hasNoShowsMessage(pageDom);
};
