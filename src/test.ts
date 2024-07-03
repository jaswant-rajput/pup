import { ExecutionBrowser } from '../../lib/executionBrowser';
const selectorOptions = {
	firstOption: {
		scrollableArea: '.review-dialog-list',
		googleReviewsList:
			'.review-dialog-list .WMbnJf.vY6njf.gws-localreviews__google-review',
		fullName: '.TSUbDb a',
		reviewText: '.Jtu6Td',
		rating: '.PuaHbe span',
		placeReviewImageUrl: '.JrO5Xe',
	},
	secondOption: {
		scrollableArea: '[jsname="nzKQQc"]',
		googleReviewsList: '.Svr5cf.bKhjM',
		fullName: '.DHIhE.QB2Jof',
		reviewText: '.K7oBsc > div > span',
		rating: 'div.GDWaad',
		reviewDate: '.iUtr1.CQYfx',
		placeReviewImageUrl: '.x7VXS.vmf5Wb.inc9Wb.VP1UCc',
	},
};
const getPlaceId = async (
	url: any,
	page: any
): Promise<{ placeId: string; selectorOption: string }> => {
	let placeId = '';
	const placeResponse: any = {};

	page.on('response', async (req) => {
		try {
			if (req.url().includes('/preview/place?')) {
				placeResponse.data = await req.text();
				placeResponse.url = req.url();
			}
		} catch (error) {
			console.log(error);
		}
	});
	const searchUrlObject = new URL(url);
	searchUrlObject.searchParams.set('hl', 'en');
	await page.goto(searchUrlObject.toString());
	await page.waitForSelector(
		'h1.DUwDvf.fontHeadlineLarge, [jsaction="pane.heroHeaderImage.click"] img, img[src="//maps.gstatic.com/tactile/pane/default_geocode-2x.png"], .RZ66Rb.FgCUCc button > img',
		{ timeout: 10000 }
	);
	// wait while we get place response data
	const initTime = Date.now();

	let selectorOption = 'first';
	const selector = '.RWPxGd[role="tablist"]';
	await page.waitForSelector(selector);
	const element = await page.$(selector);

	if (element) {
		const childCount = await page.$$eval(
			`${selector} > *`,
			(children) => children.length
		);
		if (childCount > 3) {
			selectorOption = 'second';
		}
		const thirdChildAriaLabel = await page.$eval(
			`${selector} > *:nth-child(3)`,
			(child) => child.getAttribute('aria-label')
		);

		if (thirdChildAriaLabel.startsWith('Reviews')) {
			selectorOption = 'second';
		}
	}

	while (!placeResponse.data && Date.now() - initTime < 40000) {
		await new Promise((resolve) => setTimeout(resolve, 1000));

		if (!placeResponse.data) {
			await page.click('[role="tablist"] button[aria-label^="Reviews"]');
			await new Promise((r) => setTimeout(r, 2000));
			await page.reload();
		}
		if (placeResponse.data) break;
	}

	if (placeResponse.url) {
		const placeIdMatch = placeResponse.url.match(/placeid=([^&]+)/);
		placeId = placeIdMatch ? placeIdMatch[1] : '';

		// If 'placeid=' is not found, extract from response data
		if (!placeId) {
			placeId = JSON.parse(placeResponse.data.slice(4))[6][78];
		}
	}

	return { placeId, selectorOption };
};

export default async function fetchReviews(
	{
		mapsPlaceUrl,
		skipEmptyReviews,
		maxCount,
	}: { mapsPlaceUrl: string; skipEmptyReviews: string; maxCount: number },
	searchValue: string,
	executionBrowser: ExecutionBrowser
): Promise<any[]> {
	const MAX_COUNT = Math.min(maxCount || 500, 500);

	const page = await executionBrowser.createPage();

	let selectorFlag = 'first';
	if (mapsPlaceUrl.includes('/maps/place/')) {
		const { placeId, selectorOption } = await getPlaceId(mapsPlaceUrl, page);
		selectorFlag = selectorOption;
		mapsPlaceUrl = `https://search.google.com/local/reviews?placeid=${placeId}`;
	}

	let selectors;
	if (selectorFlag === 'first') {
		selectors = selectorOptions.firstOption;
	} else {
		selectors = selectorOptions.secondOption;
	}

	await page.goto(mapsPlaceUrl);
	await page.waitForNavigation();
	await page.waitForSelector(selectors.scrollableArea);

	let reviewNodes = [];
	let previousCount = 0;

	while (reviewNodes.length < MAX_COUNT) {
		reviewNodes = await page.$$(selectors.googleReviewsList);

		const scrollHeight = await page.$eval(
			selectors.scrollableArea,
			(division) => division.scrollHeight
		);

		if (reviewNodes.length === previousCount) {
			break; // No more increasing review nodes, exit the loop
		}

		previousCount = reviewNodes.length;

		await page.evaluate(
			`document.querySelector('${selectors.scrollableArea}').scrollBy(0, ${scrollHeight})`
		);
		await new Promise((r) => setTimeout(r, 2000));
	}

	const searchResult = [];

	for (const reviewNode of reviewNodes) {
		let reviewText = await reviewNode
			.$eval(selectors.reviewText, (element) => element.innerText)
			.catch(() => '');

		if (skipEmptyReviews && !reviewText) {
			continue; // Skip reviews without reviewText
		}

		if (!reviewText) {
			reviewText = 'No review comment is available';
		}

		const fullNamePromise = reviewNode
			.$eval(selectors.fullName, (element) => element.innerText)
			.catch(() => '');

		let ratingPromise, placeReviewImageUrlPromise;
		if (selectorFlag === 'first') {
			ratingPromise = reviewNode
				.$eval(selectors.rating, (element) =>
					element.getAttribute('aria-label')
				)
				.catch(() => '');
			placeReviewImageUrlPromise = reviewNode
				.$eval(
					selectors.placeReviewImageUrl,
					(element) =>
						element.style.backgroundImage.match(/url\(['"](.+)['"]\)/)[1]
				)
				.catch(() => '');
		} else {
			ratingPromise = reviewNode
				.$eval(selectors.rating, (element) => element.innerText)
				.catch(() => '');
			placeReviewImageUrlPromise = reviewNode
				.$eval(selectors.placeReviewImageUrl, (element) => element.src)
				.catch(() => '');
		}

		const reviewDatePromise = reviewNode
			.$eval(selectors.reviewDate, (element) => element.innerText)
			.catch(() => '');

		const [fullName, rating, reviewDate, placeReviewImageUrl] =
			await Promise.all([
				fullNamePromise,
				ratingPromise,
				reviewDatePromise,
				placeReviewImageUrlPromise,
			]);

		// Extract the numerical rating from the rating string
		let numericRating;
		if (selectorFlag === 'first') {
			numericRating = rating ? parseFloat(rating.match(/(\d+\.\d+)/)[0]) : null;
		} else {
			numericRating = parseInt(rating.split('/')[0]);
		}
		searchResult.push({
			fullName,
			reviewDate,
			reviewText,
			rating: numericRating,
			placeReviewImageUrl,
		});
	}
	await page.close();
	return searchResult.slice(0, MAX_COUNT);
}
