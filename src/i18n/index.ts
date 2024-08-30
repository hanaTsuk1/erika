import i18next from 'i18next';
import { moment } from 'obsidian'

import zhCN from './zh-CN.json';
import enUS from './en-US.json';

export const resources = {
	en: { translation: enUS },
	"zh-CN": { translation: zhCN },
}

const translationLanguage = Object.keys(resources).find(
	(i) => i.toLocaleLowerCase() == moment.locale()
)
	? moment.locale()
	: "en";

export function init() {
	return i18next.init({
		lng: translationLanguage,
		fallbackLng: 'en',
		resources,
	});
}
