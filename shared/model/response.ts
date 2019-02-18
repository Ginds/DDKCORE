export interface ResponseEntityParams<T> {
    errors?: Array<string>;
    data?: T;
}

export default class ResponseEntity<T> {
    success: boolean;
    errors?: Array<string>;
    data?: T;

    constructor(params: ResponseEntityParams<T> = {}) {
        this.success = params.errors ? !Boolean(params.errors.length) : true;
        this.errors = params.errors ? params.errors : null;
        this.data = params.data ? params.data : null;
    }
}
