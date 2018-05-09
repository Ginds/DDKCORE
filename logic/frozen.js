'use strict';

var constants = require('../helpers/constants.js');
var sql = require('../sql/frogings.js');
var slots = require('../helpers/slots.js');

var request = require('request');
var async = require('async');
var Promise = require('bluebird');

// Private fields
var __private = {};
__private.types = {};

// Private fields
var modules, library, self;

// Constructor
function Frozen(logger, db, transaction, network, config, cb) {
	self = this;
	self.scope = {
		logger: logger,
		db: db,
		logic: {
			transaction: transaction
		},
		network: network,
		config: config
	};
	
	if (cb) {
		return setImmediate(cb, null, this);
	}
}


Frozen.prototype.create = function (data, trs) {
	trs.startTime = trs.timestamp;
	var date = new Date(trs.timestamp * 1000);
	trs.nextMilestone = (date.setMinutes(date.getMinutes() + constants.froze.milestone))/1000;
	trs.endTime = (date.setMinutes(date.getMinutes() - constants.froze.milestone + constants.froze.endTime))/1000;
	trs.recipientId = null;
	trs.freezedAmount = data.freezedAmount;
	return trs;
};

Frozen.prototype.ready = function (frz, sender) {
	return true;
};


Frozen.prototype.dbTable = 'stake_orders';

Frozen.prototype.dbFields = [
	"id",
	"status",
	"startTime",
	"insertTime",
	"rewardTime",
	"nextMilestone",
	"endTime",
	"senderId",
	"recipientId",
	"freezedAmount" 
];

Frozen.prototype.inactive= '0';
Frozen.prototype.active= '1';

Frozen.prototype.dbSave = function (trs) {
	return {
		table: this.dbTable,
		fields: this.dbFields,
		values: {
			id: trs.id,
			status: this.active,
			startTime: trs.startTime,
			insertTime:trs.startTime,
			rewardTime:0,
			nextMilestone: trs.nextMilestone,
			endTime : trs.endTime,
			senderId: trs.senderId,
			recipientId: trs.recipientId,
			freezedAmount: trs.freezedAmount
		}
	};
};

Frozen.prototype.dbRead = function (raw) {
	return null;
};

Frozen.prototype.objectNormalize = function (trs) {
	delete trs.blockId;
	return trs;
};

Frozen.prototype.undoUnconfirmed = function (trs, sender, cb) {
	return setImmediate(cb);
};

Frozen.prototype.applyUnconfirmed = function (trs, sender, cb) {
	return setImmediate(cb);
};

Frozen.prototype.undo = function (trs, block, sender, cb) {
	modules.accounts.setAccountAndGet({address: trs.recipientId}, function (err, recipient) {
		if (err) {
			return setImmediate(cb, err);
		}

		modules.accounts.mergeAccountAndGet({
			address: trs.recipientId,
			balance: -trs.amount,
			u_balance: -trs.amount,
			blockId: block.id,
			round: modules.rounds.calc(block.height)
		}, function (err) {
			return setImmediate(cb, err);
		});
	});
};

Frozen.prototype.apply = function (trs, block, sender, cb) {
	// var data = {
	// 	address: sender.address
	// };

	// modules.accounts.setAccountAndGet(data, cb);
	return setImmediate(cb, null, trs);
};

Frozen.prototype.getBytes = function (trs) {
	return null;
};

Frozen.prototype.process = function (trs, sender, cb) {
	return setImmediate(cb, null, trs);
};

Frozen.prototype.verify = function (trs, sender, cb) {
/*
  if (!trs.recipientId) {
		return setImmediate(cb, 'Missing recipient');
	}
*/
	if (trs.amount < 0) {
		return setImmediate(cb, 'Invalid transaction amount');
	}

	return setImmediate(cb, null, trs);
};

Frozen.prototype.calculateFee = function (trs, sender) {
	return (trs.freezedAmount * constants.fees.froze)/100;
};

Frozen.prototype.bind = function (accounts, rounds) {
	modules = {
		accounts: accounts,
		rounds: rounds,
	};
};

Frozen.prototype.checkFrozeOrders = function () {

	function getfrozeOrder() {
		return new Promise(function (resolve, reject) {
			self.scope.db.query(sql.getfrozeOrder,
				{
					milestone: constants.froze.milestone * 60,
					currentTime: slots.getTime()
				}).then(function (freezeOrders) {
					self.scope.logger.info("Successfully get :" + freezeOrders.length + ", number of froze order");
					resolve(freezeOrders);
				}).catch(function (err) {
					self.scope.logger.error(err.stack);
					reject(new Error(err.stack));
				});
		});

	}


	function checkAndUpdateMilestone() {


		//emit Stake order event when milestone change
		self.scope.network.io.sockets.emit('milestone/change', null);

		return new Promise(function (resolve, reject) {
			//Update nextMilesone in "stake_orders" table
			self.scope.db.none(sql.checkAndUpdateMilestone,
				{
					milestone: constants.froze.milestone * 60,
					currentTime: slots.getTime()
				})
				.then(function () {
					resolve();

				})
				.catch(function (err) {
					self.scope.logger.error(err.stack);
					reject(new Error(err.stack));
				});


		});
	}

	function disableFrozeOrder() {

		return new Promise(function (resolve, reject) {
			//change status and nextmilestone
			self.scope.db.none(sql.disableFrozeOrders,
				{
					currentTime: slots.getTime(),
					totalMilestone: constants.froze.endTime / constants.froze.milestone
				})
				.then(function () {
					self.scope.logger.info("Successfully check status for disable froze orders");
					resolve();
				})
				.catch(function (err) {
					self.scope.logger.error(err.stack);
					reject(new Error(err.stack));
				});
		});
	}

	function deductFrozeAmountandSendReward(freezeOrders) {
		var i;
		//return new Promise(function (resolve, reject) {

		for (i = 0; i < freezeOrders.length; i++) {
			if (freezeOrders[i].nextMilestone === freezeOrders[i].endTime) {

				self.scope.db.none(sql.deductFrozeAmount, {
					FrozeAmount: freezeOrders[i].freezedAmount,
					senderId: freezeOrders[i].senderId
				}).then(function () {
					self.scope.logger.info("Successfully check and if applicable, deduct froze amount from mem_account table");
					//resolve();
				}).catch(function (err) {
					self.scope.logger.error(err.stack);
					//reject(new Error(err.stack));
				});
			}

			//Request to send transaction
			var transactionData = {
				json: {
					secret: self.scope.config.sender.secret,
					amount: parseInt(freezeOrders[i].freezedAmount * constants.froze.reward),
					recipientId: freezeOrders[i].senderId,
					publicKey: self.scope.config.sender.publicKey
				}
			};
			//Send froze monthly rewards to users
			self.scope.logic.transaction.sendTransaction(transactionData, function (error, transactionResponse) {
				if (error)
					throw error;
				else {
					self.scope.logger.info("Successfully transfered reward for freezing an amount and transaction ID is : "+ transactionResponse.body.transactionId);
				}

			});
		}
		//});
	}
	//function to check froze orders using async/await
	(async function () {
		try {
			var freezeOrders = await getfrozeOrder();

			if (freezeOrders.length > 0) {
				await checkAndUpdateMilestone();
				await disableFrozeOrder();
				deductFrozeAmountandSendReward(freezeOrders);
			}
		} catch (err) {
			self.scope.logger.error(err.stack);
			return setImmediate(cb, err.toString());
		}

	})();
};

//Update Froze amount into mem_accounts table on every single order
Frozen.prototype.updateFrozeAmount = function (userData, cb) {

	self.scope.db.one(sql.getFrozeAmount, {
		senderId: userData.account.address
	})
		.then(function (totalFrozeAmount) {
			if (!totalFrozeAmount) {
				return setImmediate(cb, 'No Account Exist in mem_account table for' + userData.account.address);
			}
			var frozeAmountFromDB = totalFrozeAmount.totalFrozeAmount;
			var totalFrozeAmount = parseInt(frozeAmountFromDB) + parseInt(userData.freezedAmount);
			var totalFrozeAmountWithFees = totalFrozeAmount + parseInt(constants.fees.froze);
			//verify that freeze order cannot more than available balance
			if (totalFrozeAmountWithFees < userData.account.balance) {
				self.scope.db.none(sql.updateFrozeAmount, {
					freezedAmount: userData.freezedAmount,
					senderId: userData.account.address
				})
					.then(function () {
						self.scope.logger.info(userData.account.address, ': is update its froze amount in mem_accounts table ');
						return setImmediate(cb, null);
					})
					.catch(function (err) {
						self.scope.logger.error(err.stack);
						return setImmediate(cb, err.toString());
					});
			} else {
				return setImmediate(cb, 'Not have enough balance');
			}
		})
		.catch(function (err) {
			self.scope.logger.error(err.stack);
			return setImmediate(cb, err.toString());
		});



};

// Export
module.exports = Frozen;
