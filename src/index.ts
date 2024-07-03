import puppeteer from 'puppeteer-core';
const fs = require('fs');
(async () => {
	const browser = await puppeteer.launch({
		executablePath:
			'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
		headless: false,
		defaultViewport: null,
		userDataDir: './tmp',
	});
	const url =
		'https://www.amazon.in/s?bbn=81107432031&rh=n%3A81107432031%2Cp_85%3A10440599031&_encoding=UTF8';
	const page = await browser.newPage();
	await page.goto(url);

	await page.waitForSelector(
		'div.s-main-slot.s-result-list.s-search-results.sg-row'
	);

	const parentSelector =
		'div.s-main-slot.s-result-list.s-search-results.sg-row';
	const parentElement = await page.$(
		'div.s-main-slot.s-result-list.s-search-results.sg-row'
	);

	await page.waitForSelector(
		`${parentSelector} > .sg-col-4-of-24.sg-col-4-of-12.s-result-item.s-asin.sg-col-4-of-16.sg-col.s-widget-spacing-small.sg-col-4-of-20`
	);
	const childElements = await page.$$(
		`${parentSelector} > .sg-col-4-of-24.sg-col-4-of-12.s-result-item.s-asin.sg-col-4-of-16.sg-col.s-widget-spacing-small.sg-col-4-of-20`
	);

	const posts: { title: string; price: string; imageUrl: string }[] = [];
	for (let el of childElements) {
		let post = {
			title: '',
			price: '',
			imageUrl: '',
		};
		try {
			const title = await el.evaluate(
				(el) => el.querySelector('h2 > a > span').textContent
			);
			post.title = title;
		} catch (err) {
			// console.log(err);
		}
		try {
			const imageUrl = await el.evaluate((el) =>
				el
					.querySelector('.s-image.s-image-optimized-rendering')
					.getAttribute('src')
			);
			post.imageUrl = imageUrl;
		} catch (err) {
			// console.log(err);
		}
		try {
			const price = await el.evaluate(
				(el) => el.querySelector('.a-price-whole').textContent
			);
			post.price = price;
		} catch (err) {
			// console.log(err);
		}
		posts.push(post);
	}
	fs.writeFile('posts.json', JSON.stringify(posts, null, 2), (err) => {
		if (err) {
			console.log('Error writing file:', err);
		} else {
			console.log('File written successfully');
		}
	});
	await browser.close();
})();
