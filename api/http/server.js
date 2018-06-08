'use strict';

var Router = require('../../helpers/router');
var httpApi = require('../../helpers/httpApi');
var Accounts = require('../../modules/accounts');
var tokenValidator = require('../../tokenValidator');

/**
 * Renders main page wallet from public folder.
 * - Public API:
 * 	- get	/
 * @memberof module:server
 * @requires helpers/Router
 * @requires helpers/httpApi
 * @constructor
 * @param {Object} serverModule - Module server instance.
 * @param {scope} app - Main app.
 */
// Constructor
function ServerHttpApi (serverModule, app) {

	var router = new Router();

	router.use(function (req, res, next) {
		if (serverModule.areModulesReady()) { return next(); }
		res.status(500).send({success: false, error: 'Blockchain is loading'});
	});

	//get user's status
	router.get('/user/status', tokenValidator, function(req, res) {
		if(req.decoded.address) {
			Accounts.prototype.getAccount({address: req.decoded.address}, function(err, account) {
				if(!err) {
					return res.status(200).json({
						status: true,
						data: {
							success: true,
							account: account
						}
					});
				}
			});
		}else {
			return res.status(200).json({
				status: false
			});
		}
	});  

	// Referral API's
	require('../../helpers/referal').api(app);

	router.get('/', function (req, res) {
		if (serverModule.isLoaded()) {
			res.render('wallet.html', { layout: false });
		} else {
			res.render('loading.html');
		}
	});
	 
	//router.use('referals', )

	router.use(function (req, res, next) {
		if (req.url.indexOf('/api/') === -1 && req.url.indexOf('/peer/') === -1 && req.url.indexOf('/referral/') === -1) {
			return res.redirect('/');
		}
		next();
	});

	app.use('/', router);
}

module.exports = ServerHttpApi;
