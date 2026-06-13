// IndexedDB Helper for offline-first data capture in Driver PWA

export interface CaptureEvent {
  localId: string; // uuid
  jobId: string;
  stopSequence: number;
  type: "arrival" | "departure" | "photo" | "pod_ref" | "note";
  occurredAt: string; // ISO UTC
  lat?: number;
  lng?: number;
  accuracyM?: number;
  source: "geofence" | "manual";
  photoBlobKey?: string; // base64 string or storage path
  textValue?: string;
}

export interface AssignedJob {
  id: string;
  reference: string;
  customerName: string;
  vehicleTypeLabel: string;
  status: string;
  stops: Array<{
    id: string;
    sequence: number;
    siteLabel: string;
    latitude: number;
    longitude: number;
    radiusM: number;
    bookingSlotAt: string | null;
    arrivalAt: string | null;
    departureAt: string | null;
  }>;
}

const DB_NAME = "wtr_driver_db";
const DB_VERSION = 1;
let dbInstance: IDBDatabase | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("pendingEvents")) {
        db.createObjectStore("pendingEvents", { keyPath: "localId" });
      }
      if (!db.objectStoreNames.contains("assignedJobs")) {
        db.createObjectStore("assignedJobs", { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
    request.onerror = () => reject(request.error);
  });
}

export const db = {
  async addEvent(event: CaptureEvent): Promise<void> {
    const database = await getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction("pendingEvents", "readwrite");
      const store = tx.objectStore("pendingEvents");
      const request = store.put(event);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async getPendingEvents(): Promise<CaptureEvent[]> {
    const database = await getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction("pendingEvents", "readonly");
      const store = tx.objectStore("pendingEvents");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async removeEvent(localId: string): Promise<void> {
    const database = await getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction("pendingEvents", "readwrite");
      const store = tx.objectStore("pendingEvents");
      const request = store.delete(localId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async saveJobs(jobs: AssignedJob[]): Promise<void> {
    const database = await getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction("assignedJobs", "readwrite");
      const store = tx.objectStore("assignedJobs");
      store.clear();
      for (const job of jobs) {
        store.put(job);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getCachedJobs(): Promise<AssignedJob[]> {
    const database = await getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction("assignedJobs", "readonly");
      const store = tx.objectStore("assignedJobs");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
};
