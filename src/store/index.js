const { FileStore } = require("./fileStore");

function getStore(config) {
  if (String(config.storageDriver || "").toLowerCase() === "firestore") {
    const { FirestoreStore } = require("./firestoreStore");
    return new FirestoreStore();
  }
  return new FileStore(config.storageFile);
}

module.exports = {
  getStore
};
