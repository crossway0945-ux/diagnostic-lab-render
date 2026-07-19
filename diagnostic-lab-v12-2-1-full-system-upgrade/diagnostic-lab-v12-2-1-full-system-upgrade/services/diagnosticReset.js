import { createHash } from "node:crypto";

export async function runDiagnosticReset({ storage, jobStore, execute = false }) {
  const beforeStorageManifest = await storage.getDiagnosticResetManifest();
  const beforeJobManifest = await jobStore.getDiagnosticResetManifest();
  const beforeProtected = await protectedSnapshot(storage);
  const beforeManifest = buildManifest(beforeStorageManifest, beforeJobManifest, beforeProtected);
  assertProtectedStoresExcluded(beforeManifest);

  if (!execute) {
    return { mode: "dry-run", manifest: beforeManifest };
  }

  await storage.clearDiagnosticData();
  await jobStore.clearDiagnosticData();

  const afterStorageManifest = await storage.getDiagnosticResetManifest();
  const afterJobManifest = await jobStore.getDiagnosticResetManifest();
  const afterProtected = await protectedSnapshot(storage);
  const afterManifest = buildManifest(afterStorageManifest, afterJobManifest, afterProtected);

  assertProtectedStoresExcluded(afterManifest);
  assertDiagnosticStoresEmpty(afterManifest);
  assertProtectedStoresUnchanged(beforeProtected, afterProtected);
  return { mode: "executed", before: beforeManifest, after: afterManifest };
}

async function protectedSnapshot(storage) {
  const snapshot = await storage.getProtectedDataSnapshot();
  return {
    users: { recordCount: snapshot.users.length, checksum: checksum(snapshot.users) },
    securityAudit: { recordCount: snapshot.audit.length, checksum: checksum(snapshot.audit) }
  };
}

function buildManifest(storageManifest, jobManifest, protectedSnapshot) {
  return {
    adapter: storageManifest.adapter,
    diagnosticStores: [
      ...storageManifest.diagnosticStores,
      jobManifest,
      {
        store: "browser-print-output",
        dataType: "generated PDF files",
        recordCount: 0,
        willClear: true,
        note: "No server-side PDF store exists; PDF export is generated in the browser from saved report data."
      }
    ],
    protectedStores: storageManifest.protectedStores.map((store) => ({
      ...store,
      checksum: store.dataType.startsWith("users")
        ? protectedSnapshot.users.checksum
        : protectedSnapshot.securityAudit.checksum
    }))
  };
}

function assertProtectedStoresExcluded(manifest) {
  const forbidden = ["users.json", "usage-audit.json"];
  for (const store of manifest.diagnosticStores) {
    const storeName = String(store.store || "").toLowerCase();
    if (forbidden.some((name) => storeName.endsWith(name)) || store.willClear !== true) {
      throw new Error(`Unsafe reset manifest entry: ${store.store}`);
    }
  }
  if (manifest.protectedStores.some((store) => store.willClear !== false)) {
    throw new Error("A protected store was incorrectly marked for deletion.");
  }
}

function assertDiagnosticStoresEmpty(manifest) {
  const remaining = manifest.diagnosticStores.filter((store) => Number(store.recordCount || 0) !== 0);
  if (remaining.length) {
    throw new Error(`Diagnostic reset verification failed for: ${remaining.map((store) => store.store).join(", ")}`);
  }
}

function assertProtectedStoresUnchanged(before, after) {
  for (const key of Object.keys(before)) {
    if (before[key].recordCount !== after[key].recordCount || before[key].checksum !== after[key].checksum) {
      throw new Error(`Protected store changed during reset: ${key}`);
    }
  }
}

function checksum(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
