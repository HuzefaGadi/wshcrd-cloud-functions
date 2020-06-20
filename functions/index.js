const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp(functions.config().firebase);

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });

exports.newRequestCreated = functions.firestore
  .document("requests/{requestId}")
  .onCreate(async (snapshot, context) => {
    const newRequest = snapshot.data();

    console.log("Data is " + newRequest);
    console.log("snapshot is " + snapshot);
    console.log("Doc id is " + context.params.requestId);
  });

exports.onPaymentAdded = functions.firestore
  .document("payments/{paymentId}")
  .onCreate(async (snapshot, context) => {
    const addedPayment = snapshot.data();
    console.log("onPaymentAdded Data is " + addedPayment);
    console.log("onPaymentAdded Doc id is " + context.params.paymentId);
    const ledgers = admin.firestore().collection("ledgers");
    return ledgers
      .where("ledgerId", "==", addedPayment.ledgerId)
      .limit(1)
      .get()
      .then(ledgerSnapshot => {
        if (ledgerSnapshot && ledgerSnapshot.docs.length > 0) {
          let ledger = ledgerSnapshot.docs[0].data();
          console.log(ledger);
          if (
            !ledger.lastUpdateDateInEpoc ||
            ledger.lastUpdateDateInEpoc === null ||
            ledger.lastUpdateDateInEpoc < addedPayment.dateTimeInEpoc
          ) {
            console.log("update ledger for payment" + ledger.ledgerId);
            console.log("current amount " + ledger.balance);
            console.log("Payment amount " + addedPayment.amount);

            return ledgers.doc(ledger.ledgerId).update({
              balance:
                addedPayment.type === "get"
                  ? ledger.balance + addedPayment.amount
                  : ledger.balance - addedPayment.amount,
              lastPayAmount: addedPayment.amount,
              lastPayType: addedPayment.type,
              lastUpdateDateInEpoc: new Date(
                new Date().toUTCString()
              ).getTime(),
              hasPayments: true
            });
          } else if (
            ledger.lastUpdateDateInEpoc > addedPayment.dateTimeInEpoc
          ) {
            return ledgers.doc(ledger.ledgerId).update({
              balance:
                addedPayment.type === "get"
                  ? ledger.balance + addedPayment.amount
                  : ledger.balance - addedPayment.amount,
              hasPayments: true
            });
          }
          return null;
        } else {
          return null;
        }
      });
  });

exports.onLedgerDeleted = functions.firestore
  .document("ledgers/{ledgerId}")
  .onDelete(async (snapshot, context) => {
    const payments = admin.firestore().collection("payments");
    const customers = admin.firestore().collection("customers");
    const deletedLedger = snapshot.data();

    console.log("onDelete Data is " + deletedLedger);
    console.log("onDelete Doc id is " + context.params.ledgerId);
    let query = payments.where("ledgerId", "==", context.params.ledgerId);

    console.log("onDelete Data Ledgers found " + query);

    return new Promise((resolve, reject) => {
      deleteQueryBatch(admin.firestore(), query, resolve, reject);
      customers.doc(deletedLedger.customerId).update({
        ownerIds: admin.firestore.FieldValue.arrayRemove(deletedLedger.ownerId)
      });
    });
  });

function deleteQueryBatch(db, query, resolve, reject) {
  query
    .get()
    .then(snapshot => {
      // When there are no documents left, we are done
      console.log("onDelete Data Ledgers found " + snapshot.size);
      if (snapshot.size === 0) {
        return 0;
      }

      // Delete documents in a batch
      let batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      return batch.commit().then(() => {
        return snapshot.size;
      });
    })
    .then(numDeleted => {
      if (numDeleted === 0) {
        resolve();
        return;
      }

      process.nextTick(() => {
        deleteQueryBatch(db, query, resolve, reject);
      });
      return;
    })
    .catch(reject);
}
exports.onLedgerAdded = functions.firestore
  .document("ledgers/{ledgerId}")
  .onCreate(async (snapshot, context) => {
    const customers = admin.firestore().collection("customers");
    const addedLedger = snapshot.data();

    console.log("onCreate Data is " + addedLedger);
    console.log("onCreate Doc id is " + context.params.ledgerId);

    return customers.doc(addedLedger.customerId).update({
      ownerIds: admin.firestore.FieldValue.arrayUnion(addedLedger.ownerId)
    });
  });
