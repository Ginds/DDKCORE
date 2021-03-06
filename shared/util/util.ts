import { Direction } from 'api/utils/common';

export function shuffle(array: Array<any>): Array<any> {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

export function getRandomInt(min, max): number {
    return Math.floor(Math.random() * (max - min)) + min;
}

export function toSnakeCase(str) {
    function upperToHyphenLower(match) {
        return '_' + match.toLowerCase();
    }

    return str.replace(/[A-Z]/g, upperToHyphenLower);
}

export function sortByKey(key: string, direction?: Direction): (a: any, b: any) => number {
    return (a: { key: any } & any, b: { key: any } & any) => {
        if (a[key] > b[key]) {
            return direction === 'ASC' ? 1 : -1;
        }
        if (a[key] < b[key]) {
            return direction === 'ASC' ? -1 : 1;
        }
        return 0;
    };
}
