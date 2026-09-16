import { Sale, Product, BusinessConfig } from '../types';
import { db, DEFAULT_BUSINESS_ID } from './firebase';
import { doc, setDoc, updateDoc, increment, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { logAuditAction } from './utils';
import { DEFAULT_PHARMACY_CATEGORIES, DEFAULT_PHARMACY_PRODUCTS } from './chemistProductsData';

export interface OfflineStatus {
  isOnline: boolean;
  pendingSalesCount: number;
  isSyncing: boolean;
  lastSyncTime: string | null;
}

type StatusListener = (status: OfflineStatus) => void;
const listeners: Set<StatusListener> = new Set();

let isSyncing = false;

// Initial state
function getStoredPendingSales(): Sale[] {
  try {
    return JSON.parse(localStorage.getItem('bar_pos_offline_sales_queue') || '[]');
  } catch (e) {
    return [];
  }
}

function savePendingSales(queue: Sale[]) {
  localStorage.setItem('bar_pos_offline_sales_queue', JSON.stringify(queue));
  notifyListeners();
}

export function getOfflineStatus(): OfflineStatus {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const pendingSales = getStoredPendingSales();
  const lastSyncTime = localStorage.getItem('bar_pos_last_sync_time');

  return {
    isOnline,
    pendingSalesCount: pendingSales.length,
    isSyncing,
    lastSyncTime
  };
}

export function subscribeOfflineStatus(listener: StatusListener): () => void {
  listeners.add(listener);
  listener(getOfflineStatus());
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  const current = getOfflineStatus();
  listeners.forEach(fn => {
    try {
      fn(current);
    } catch (e) {
      console.error('Error in offline listener:', e);
    }
  });
}

// Global online/offline event listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[OfflineManager] Connection restored! Triggering sync...');
    notifyListeners();
    // Auto sync when reconnecting
    setTimeout(() => {
      syncOfflineQueue();
    }, 1500);
  });

  window.addEventListener('offline', () => {
    console.log('[OfflineManager] System is now operating OFFLINE.');
    notifyListeners();
  });
}

/**
 * Cache products and categories locally
 */
export function cacheLocalProducts(products: Product[]) {
  try {
    localStorage.setItem('bar_pos_local_products', JSON.stringify(products));
    localStorage.setItem('bar_pos_products_cache_date', new Date().toISOString());
  } catch (e) {
    console.warn('Failed to cache products locally:', e);
  }
}

export const DEFAULT_FALLBACK_PRODUCTS: Product[] = DEFAULT_PHARMACY_PRODUCTS;

const _OLD_FALLBACK_PRODUCTS: any[] = [
  {
    id: 'prod-amox-500',
    name: 'Amoxicillin 500mg Capsules',
    genericName: 'Amoxicillin Trihydrate',
    dosage: '500mg',
    barcode: '616110002001',
    categoryId: 'cat-antibiotics',
    categoryName: 'Antibiotics & Anti-Infectives',
    unitType: 'Blister Pack',
    buyingPrice: 150,
    sellingPrice: 300,
    openingStock: 80,
    currentStock: 80,
    stockAdded: 0,
    minStockLevel: 15,
    prescriptionRequired: true,
    batchNumber: 'AMX-2026-09',
    expiryDate: '2028-05-31',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-augmentin-625',
    name: 'Augmentin 625mg Tablets (14s)',
    genericName: 'Amoxicillin / Clavulanic Acid',
    dosage: '625mg',
    barcode: '616110002002',
    categoryId: 'cat-antibiotics',
    categoryName: 'Antibiotics & Anti-Infectives',
    unitType: 'Strip',
    buyingPrice: 850,
    sellingPrice: 1400,
    openingStock: 40,
    currentStock: 40,
    stockAdded: 0,
    minStockLevel: 10,
    prescriptionRequired: true,
    batchNumber: 'AUG-8841',
    expiryDate: '2028-03-31',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-azithro-500',
    name: 'Azithromycin 500mg Tablets (3s)',
    genericName: 'Azithromycin Dihydrate',
    dosage: '500mg',
    barcode: '616110002003',
    categoryId: 'cat-antibiotics',
    categoryName: 'Antibiotics & Anti-Infectives',
    unitType: 'Pack',
    buyingPrice: 220,
    sellingPrice: 450,
    openingStock: 60,
    currentStock: 60,
    stockAdded: 0,
    minStockLevel: 10,
    prescriptionRequired: true,
    batchNumber: 'AZI-4102',
    expiryDate: '2027-11-30',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-cipro-500',
    name: 'Ciprofloxacin 500mg Tablets (10s)',
    genericName: 'Ciprofloxacin Hydrochloride',
    dosage: '500mg',
    barcode: '616110002004',
    categoryId: 'cat-antibiotics',
    categoryName: 'Antibiotics & Anti-Infectives',
    unitType: 'Blister Pack',
    buyingPrice: 180,
    sellingPrice: 350,
    openingStock: 50,
    currentStock: 50,
    stockAdded: 0,
    minStockLevel: 10,
    prescriptionRequired: true,
    batchNumber: 'CIP-9921',
    expiryDate: '2028-01-31',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-para-500',
    name: 'Paracetamol 500mg Tablets (10s)',
    genericName: 'Acetaminophen / Paracetamol',
    dosage: '500mg',
    barcode: '616110002005',
    categoryId: 'cat-otc-pain',
    categoryName: 'Pain Relief & Analgesics',
    unitType: 'Blister Pack',
    buyingPrice: 20,
    sellingPrice: 50,
    openingStock: 250,
    currentStock: 250,
    stockAdded: 0,
    minStockLevel: 30,
    prescriptionRequired: false,
    batchNumber: 'PAR-1092',
    expiryDate: '2029-01-31',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-panadol-extra',
    name: 'Panadol Extra Tablets (20s)',
    genericName: 'Paracetamol + Caffeine',
    dosage: '500mg/65mg',
    barcode: '616110002006',
    categoryId: 'cat-otc-pain',
    categoryName: 'Pain Relief & Analgesics',
    unitType: 'Pack',
    buyingPrice: 120,
    sellingPrice: 220,
    openingStock: 120,
    currentStock: 120,
    stockAdded: 0,
    minStockLevel: 20,
    prescriptionRequired: false,
    batchNumber: 'PAN-7734',
    expiryDate: '2028-08-31',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-ibup-400',
    name: 'Ibuprofen 400mg Tablets (10s)',
    genericName: 'Ibuprofen',
    dosage: '400mg',
    barcode: '616110002007',
    categoryId: 'cat-otc-pain',
    categoryName: 'Pain Relief & Analgesics',
    unitType: 'Blister Pack',
    buyingPrice: 40,
    sellingPrice: 100,
    openingStock: 150,
    currentStock: 150,
    stockAdded: 0,
    minStockLevel: 20,
    prescriptionRequired: false,
    batchNumber: 'IBU-5521',
    expiryDate: '2028-06-30',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-diclo-50',
    name: 'Diclofenac Sodium 50mg Tablets (10s)',
    genericName: 'Diclofenac Sodium',
    dosage: '50mg',
    barcode: '616110002008',
    categoryId: 'cat-otc-pain',
    categoryName: 'Pain Relief & Analgesics',
    unitType: 'Blister Pack',
    buyingPrice: 50,
    sellingPrice: 120,
    openingStock: 100,
    currentStock: 100,
    stockAdded: 0,
    minStockLevel: 15,
    prescriptionRequired: false,
    batchNumber: 'DIC-3342',
    expiryDate: '2028-04-30',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-benylin-flu',
    name: 'Benylin 4-Flu Cough Syrup (100ml)',
    genericName: 'Diphenhydramine, Paracetamol, Pseudoephedrine',
    dosage: '100ml',
    barcode: '616110002009',
    categoryId: 'cat-cough-respiratory',
    categoryName: 'Cough, Cold & Respiratory',
    unitType: 'Syrup (100ml)',
    buyingPrice: 380,
    sellingPrice: 580,
    openingStock: 65,
    currentStock: 65,
    stockAdded: 0,
    minStockLevel: 12,
    prescriptionRequired: false,
    batchNumber: 'BEN-9102',
    expiryDate: '2027-10-31',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-ascoril-100',
    name: 'Ascoril Expectorant Syrup (100ml)',
    genericName: 'Bromhexine, Guaifenesin, Terbutaline',
    dosage: '100ml',
    barcode: '616110002010',
    categoryId: 'cat-cough-respiratory',
    categoryName: 'Cough, Cold & Respiratory',
    unitType: 'Syrup (100ml)',
    buyingPrice: 320,
    sellingPrice: 520,
    openingStock: 55,
    currentStock: 55,
    stockAdded: 0,
    minStockLevel: 10,
    prescriptionRequired: false,
    batchNumber: 'ASC-6631',
    expiryDate: '2027-12-31',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-strepsils',
    name: 'Strepsils Honey & Lemon Lozenges (16s)',
    genericName: 'Dichlorobenzyl alcohol & Amylmetacresol',
    dosage: '16 Lozenges',
    barcode: '616110002011',
    categoryId: 'cat-cough-respiratory',
    categoryName: 'Cough, Cold & Respiratory',
    unitType: 'Pack',
    buyingPrice: 160,
    sellingPrice: 280,
    openingStock: 90,
    currentStock: 90,
    stockAdded: 0,
    minStockLevel: 15,
    prescriptionRequired: false,
    batchNumber: 'STP-4421',
    expiryDate: '2028-09-30',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-cetirizine-10',
    name: 'Cetirizine 10mg Allergy Tablets (10s)',
    genericName: 'Cetirizine Dihydrochloride',
    dosage: '10mg',
    barcode: '616110002012',
    categoryId: 'cat-cough-respiratory',
    categoryName: 'Cough, Cold & Respiratory',
    unitType: 'Strip',
    buyingPrice: 30,
    sellingPrice: 80,
    openingStock: 120,
    currentStock: 120,
    stockAdded: 0,
    minStockLevel: 20,
    prescriptionRequired: false,
    batchNumber: 'CET-8812',
    expiryDate: '2028-11-30',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-omeprazole-20',
    name: 'Omeprazole 20mg Capsules (14s)',
    genericName: 'Omeprazole Delayed-Release',
    dosage: '20mg',
    barcode: '616110002013',
    categoryId: 'cat-digestive',
    categoryName: 'Digestive & Gastrointestinal',
    unitType: 'Strip',
    buyingPrice: 120,
    sellingPrice: 250,
    openingStock: 95,
    currentStock: 95,
    stockAdded: 0,
    minStockLevel: 15,
    prescriptionRequired: false,
    batchNumber: 'OME-3301',
    expiryDate: '2028-02-28',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-gaviscon-200',
    name: 'Gaviscon Double Action Liquid (200ml)',
    genericName: 'Sodium alginate, Calcium carbonate',
    dosage: '200ml',
    barcode: '616110002014',
    categoryId: 'cat-digestive',
    categoryName: 'Digestive & Gastrointestinal',
    unitType: 'Syrup (200ml)',
    buyingPrice: 650,
    sellingPrice: 950,
    openingStock: 40,
    currentStock: 40,
    stockAdded: 0,
    minStockLevel: 8,
    prescriptionRequired: false,
    batchNumber: 'GAV-1190',
    expiryDate: '2027-08-31',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-ors-sachet',
    name: 'Oral Rehydration Salts (ORS) Sachet',
    genericName: 'WHO Oral Rehydration Formula',
    dosage: '20.5g powder',
    barcode: '616110002015',
    categoryId: 'cat-digestive',
    categoryName: 'Digestive & Gastrointestinal',
    unitType: 'Sachet',
    buyingPrice: 15,
    sellingPrice: 40,
    openingStock: 300,
    currentStock: 300,
    stockAdded: 0,
    minStockLevel: 50,
    prescriptionRequired: false,
    batchNumber: 'ORS-9932',
    expiryDate: '2029-04-30',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-vit-c-eff',
    name: 'Vitamin C 1000mg Effervescent (20s)',
    genericName: 'Ascorbic Acid + Zinc',
    dosage: '1000mg',
    barcode: '616110002017',
    categoryId: 'cat-vitamins',
    categoryName: 'Vitamins & Supplements',
    unitType: 'Tube',
    buyingPrice: 350,
    sellingPrice: 550,
    openingStock: 70,
    currentStock: 70,
    stockAdded: 0,
    minStockLevel: 15,
    prescriptionRequired: false,
    batchNumber: 'VTC-7721',
    expiryDate: '2028-06-30',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-zinc-20',
    name: 'Zinc Sulphate 20mg Tablets (10s)',
    genericName: 'Zinc Sulphate Monohydrate',
    dosage: '20mg',
    barcode: '616110002018',
    categoryId: 'cat-vitamins',
    categoryName: 'Vitamins & Supplements',
    unitType: 'Strip',
    buyingPrice: 25,
    sellingPrice: 60,
    openingStock: 150,
    currentStock: 150,
    stockAdded: 0,
    minStockLevel: 25,
    prescriptionRequired: false,
    batchNumber: 'ZNC-5512',
    expiryDate: '2028-10-31',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-cod-liver',
    name: 'Seven Seas Pure Cod Liver Oil (150ml)',
    genericName: 'Omega-3 + Vitamins A, D, E',
    dosage: '150ml',
    barcode: '616110002019',
    categoryId: 'cat-vitamins',
    categoryName: 'Vitamins & Supplements',
    unitType: 'Bottle',
    buyingPrice: 420,
    sellingPrice: 680,
    openingStock: 45,
    currentStock: 45,
    stockAdded: 0,
    minStockLevel: 10,
    prescriptionRequired: false,
    batchNumber: '7S-8832',
    expiryDate: '2027-12-31',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-betadine-100',
    name: 'Betadine Antiseptic Solution 10% (100ml)',
    genericName: 'Povidone Iodine 10% w/v',
    dosage: '100ml',
    barcode: '616110002021',
    categoryId: 'cat-first-aid',
    categoryName: 'First Aid & Surgical Supplies',
    unitType: 'Bottle',
    buyingPrice: 220,
    sellingPrice: 380,
    openingStock: 60,
    currentStock: 60,
    stockAdded: 0,
    minStockLevel: 12,
    prescriptionRequired: false,
    batchNumber: 'BET-4401',
    expiryDate: '2028-07-31',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-surgical-spirit',
    name: 'Surgical Spirit B.P. 70% (200ml)',
    genericName: 'Ethanol 70% Disinfectant',
    dosage: '200ml',
    barcode: '616110002022',
    categoryId: 'cat-first-aid',
    categoryName: 'First Aid & Surgical Supplies',
    unitType: 'Bottle',
    buyingPrice: 90,
    sellingPrice: 180,
    openingStock: 85,
    currentStock: 85,
    stockAdded: 0,
    minStockLevel: 15,
    prescriptionRequired: false,
    batchNumber: 'SPR-2210',
    expiryDate: '2029-01-31',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-crepe-bandage',
    name: 'Crepe Bandage 7.5cm x 4.5m',
    genericName: 'Elastic Compression Bandage',
    dosage: '7.5cm',
    barcode: '616110002023',
    categoryId: 'cat-first-aid',
    categoryName: 'First Aid & Surgical Supplies',
    unitType: 'Roll',
    buyingPrice: 60,
    sellingPrice: 130,
    openingStock: 100,
    currentStock: 100,
    stockAdded: 0,
    minStockLevel: 20,
    prescriptionRequired: false,
    batchNumber: 'CRP-1122',
    expiryDate: '2030-01-01',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-sterile-gauze',
    name: 'Sterile Gauze Swabs 8-ply (5s)',
    genericName: '100% Pure Cotton Gauze',
    dosage: '10cm x 10cm',
    barcode: '616110002024',
    categoryId: 'cat-first-aid',
    categoryName: 'First Aid & Surgical Supplies',
    unitType: 'Pack',
    buyingPrice: 40,
    sellingPrice: 90,
    openingStock: 120,
    currentStock: 120,
    stockAdded: 0,
    minStockLevel: 25,
    prescriptionRequired: false,
    batchNumber: 'GAU-3321',
    expiryDate: '2029-12-31',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-cotton-wool',
    name: 'Absorbent Cotton Wool 100g',
    genericName: 'Medical Grade Cotton Wool',
    dosage: '100g',
    barcode: '616110002025',
    categoryId: 'cat-first-aid',
    categoryName: 'First Aid & Surgical Supplies',
    unitType: 'Roll',
    buyingPrice: 80,
    sellingPrice: 160,
    openingStock: 90,
    currentStock: 90,
    stockAdded: 0,
    minStockLevel: 15,
    prescriptionRequired: false,
    batchNumber: 'COT-7741',
    expiryDate: '2030-06-30',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-elastoplast',
    name: 'Elastoplast Fabric Plasters (20s)',
    genericName: 'Sterile Adhesive Wound Plaster',
    dosage: '20 strips',
    barcode: '616110002026',
    categoryId: 'cat-first-aid',
    categoryName: 'First Aid & Surgical Supplies',
    unitType: 'Box',
    buyingPrice: 150,
    sellingPrice: 280,
    openingStock: 75,
    currentStock: 75,
    stockAdded: 0,
    minStockLevel: 15,
    prescriptionRequired: false,
    batchNumber: 'ELA-9021',
    expiryDate: '2029-03-31',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-thermometer',
    name: 'Digital Clinical Oral Thermometer',
    genericName: 'LCD Fast Read Clinical Thermometer',
    dosage: '1 Unit',
    barcode: '616110002027',
    categoryId: 'cat-diagnostics',
    categoryName: 'Diagnostics & Medical Devices',
    unitType: 'Piece',
    buyingPrice: 250,
    sellingPrice: 450,
    openingStock: 30,
    currentStock: 30,
    stockAdded: 0,
    minStockLevel: 5,
    prescriptionRequired: false,
    batchNumber: 'THM-5511',
    expiryDate: '2031-12-31',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-accu-chek',
    name: 'Accu-Chek Blood Glucose Test Strips (50s)',
    genericName: 'Blood Glucose Test Strips',
    dosage: '50 strips',
    barcode: '616110002028',
    categoryId: 'cat-diagnostics',
    categoryName: 'Diagnostics & Medical Devices',
    unitType: 'Box',
    buyingPrice: 1800,
    sellingPrice: 2600,
    openingStock: 20,
    currentStock: 20,
    stockAdded: 0,
    minStockLevel: 5,
    prescriptionRequired: false,
    batchNumber: 'ACC-8834',
    expiryDate: '2027-09-30',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-clotrimazole',
    name: 'Clotrimazole 1% Antifungal Cream (20g)',
    genericName: 'Clotrimazole USP 1% w/w',
    dosage: '20g tube',
    barcode: '616110002029',
    categoryId: 'cat-skin',
    categoryName: 'Dermatology & Topicals',
    unitType: 'Tube',
    buyingPrice: 70,
    sellingPrice: 160,
    openingStock: 65,
    currentStock: 65,
    stockAdded: 0,
    minStockLevel: 12,
    prescriptionRequired: false,
    batchNumber: 'CLO-4412',
    expiryDate: '2028-05-31',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-hydrocortisone',
    name: 'Hydrocortisone 1% Topical Cream (15g)',
    genericName: 'Hydrocortisone Acetate 1%',
    dosage: '15g tube',
    barcode: '616110002030',
    categoryId: 'cat-skin',
    categoryName: 'Dermatology & Topicals',
    unitType: 'Tube',
    buyingPrice: 80,
    sellingPrice: 180,
    openingStock: 50,
    currentStock: 50,
    stockAdded: 0,
    minStockLevel: 10,
    prescriptionRequired: false,
    batchNumber: 'HYD-2219',
    expiryDate: '2028-02-28',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-dettol-250',
    name: 'Dettol Antiseptic Disinfectant (250ml)',
    genericName: 'Chloroxylenol Antiseptic Liquid',
    dosage: '250ml',
    barcode: '616110002031',
    categoryId: 'cat-skin',
    categoryName: 'Dermatology & Topicals',
    unitType: 'Bottle',
    buyingPrice: 280,
    sellingPrice: 450,
    openingStock: 50,
    currentStock: 50,
    stockAdded: 0,
    minStockLevel: 10,
    prescriptionRequired: false,
    batchNumber: 'DET-7721',
    expiryDate: '2028-11-30',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-gripe-water',
    name: 'Woodwards Gripe Water (150ml)',
    genericName: 'Dill Seed Oil, Sodium Bicarbonate',
    dosage: '150ml',
    barcode: '616110002032',
    categoryId: 'cat-baby',
    categoryName: 'Maternal & Child Health',
    unitType: 'Bottle',
    buyingPrice: 220,
    sellingPrice: 360,
    openingStock: 40,
    currentStock: 40,
    stockAdded: 0,
    minStockLevel: 8,
    prescriptionRequired: false,
    batchNumber: 'GRP-3310',
    expiryDate: '2027-10-31',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-calpol-100',
    name: 'Calpol Infant Suspension Paracetamol (100ml)',
    genericName: 'Paracetamol Paediatric 120mg/5ml',
    dosage: '100ml',
    barcode: '616110002033',
    categoryId: 'cat-baby',
    categoryName: 'Maternal & Child Health',
    unitType: 'Syrup (100ml)',
    buyingPrice: 340,
    sellingPrice: 520,
    openingStock: 45,
    currentStock: 45,
    stockAdded: 0,
    minStockLevel: 10,
    prescriptionRequired: false,
    batchNumber: 'CAL-9912',
    expiryDate: '2028-01-31',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-amlodipine-5',
    name: 'Amlodipine 5mg Blood Pressure Tablets (30s)',
    genericName: 'Amlodipine Besylate',
    dosage: '5mg',
    barcode: '616110002034',
    categoryId: 'cat-presc',
    categoryName: 'Prescription Medicines',
    unitType: 'Box',
    buyingPrice: 180,
    sellingPrice: 380,
    openingStock: 55,
    currentStock: 55,
    stockAdded: 0,
    minStockLevel: 10,
    prescriptionRequired: true,
    batchNumber: 'AML-4419',
    expiryDate: '2028-04-30',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-metformin-500',
    name: 'Metformin 500mg Diabetes Tablets (100s)',
    genericName: 'Metformin Hydrochloride',
    dosage: '500mg',
    barcode: '616110002035',
    categoryId: 'cat-presc',
    categoryName: 'Prescription Medicines',
    unitType: 'Box',
    buyingPrice: 350,
    sellingPrice: 650,
    openingStock: 40,
    currentStock: 40,
    stockAdded: 0,
    minStockLevel: 10,
    prescriptionRequired: true,
    batchNumber: 'MET-8821',
    expiryDate: '2028-07-31',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export const DEFAULT_FALLBACK_CATEGORIES = DEFAULT_PHARMACY_CATEGORIES;

export function cleanupFoodCourtProducts() {
  try {
    const isNonChemist = (text: string) => {
      const t = text.toLowerCase();
      return t.includes('room') ||
             t.includes('hotel') ||
             t.includes('beer') ||
             t.includes('tusker') ||
             t.includes('white cap') ||
             t.includes('guinness') ||
             t.includes('heineken') ||
             t.includes('smirnoff') ||
             t.includes('vodka') ||
             t.includes('whiskey') ||
             t.includes('cocktail') ||
             t.includes('tilapia') ||
             t.includes('pilau') ||
             t.includes('burger') ||
             t.includes('food court');
    };

    const rawProds = localStorage.getItem('bar_pos_local_products');
    if (rawProds) {
      const prods: Product[] = JSON.parse(rawProds);
      const cleaned = prods.filter(p => {
        const text = p.name + ' ' + (p.categoryName || '') + ' ' + p.id;
        return !isNonChemist(text);
      });
      // If all products were removed or empty, seed with default fallback chemist products
      if (cleaned.length === 0) {
        localStorage.setItem('bar_pos_local_products', JSON.stringify(DEFAULT_FALLBACK_PRODUCTS));
      } else {
        localStorage.setItem('bar_pos_local_products', JSON.stringify(cleaned));
      }
    } else {
      localStorage.setItem('bar_pos_local_products', JSON.stringify(DEFAULT_FALLBACK_PRODUCTS));
    }

    const rawCats = localStorage.getItem('bar_pos_local_categories');
    if (rawCats) {
      const cats: { id: string; name: string; description?: string }[] = JSON.parse(rawCats);
      const cleanedCats = cats.filter(c => {
        const text = c.name + ' ' + (c.description || '') + ' ' + c.id;
        return !isNonChemist(text);
      });
      if (cleanedCats.length === 0) {
        localStorage.setItem('bar_pos_local_categories', JSON.stringify(DEFAULT_FALLBACK_CATEGORIES));
      } else {
        localStorage.setItem('bar_pos_local_categories', JSON.stringify(cleanedCats));
      }
    } else {
      localStorage.setItem('bar_pos_local_categories', JSON.stringify(DEFAULT_FALLBACK_CATEGORIES));
    }
  } catch (e) {
    console.error('Failed to cleanup non-chemist products:', e);
  }
}

// Backward compatibility alias so existing calls don't break
export const cleanupChemistProducts = cleanupFoodCourtProducts;

export function getLocalCachedProducts(): Product[] {
  cleanupFoodCourtProducts();
  try {
    const stored = JSON.parse(localStorage.getItem('bar_pos_local_products') || '[]');
    if (Array.isArray(stored) && stored.length > 0) {
      let changed = false;
      const enriched = stored.map((p: Product, idx: number) => {
        if (!p.barcode) {
          const fallback = DEFAULT_FALLBACK_PRODUCTS.find(fb => fb.id === p.id);
          p.barcode = fallback?.barcode || `61611000${(2000 + idx).toString().slice(-4)}`;
          changed = true;
        }
        return p;
      });
      if (changed) {
        localStorage.setItem('bar_pos_local_products', JSON.stringify(enriched));
      }
      return enriched;
    }
  } catch (e) {
    // fallback
  }
  // Initialize with fallback products if cache is empty
  cacheLocalProducts(DEFAULT_FALLBACK_PRODUCTS);
  return DEFAULT_FALLBACK_PRODUCTS;
}

export function cacheLocalCategories(categories: { id: string; name: string; description?: string }[]) {
  try {
    localStorage.setItem('bar_pos_local_categories', JSON.stringify(categories));
  } catch (e) {
    console.warn('Failed to cache categories locally:', e);
  }
}

export function getLocalCachedCategories(): { id: string; name: string; description?: string }[] {
  try {
    const stored = JSON.parse(localStorage.getItem('bar_pos_local_categories') || '[]');
    if (Array.isArray(stored) && stored.length > 0) {
      return stored;
    }
  } catch (e) {
    // fallback
  }
  cacheLocalCategories(DEFAULT_FALLBACK_CATEGORIES);
  return DEFAULT_FALLBACK_CATEGORIES;
}

/**
 * Deduct stock locally immediately
 */
export function deductLocalProductStock(items: { productId: string; quantity: number }[]) {
  try {
    const products = getLocalCachedProducts();
    for (const item of items) {
      if (item.productId.startsWith('custom-')) continue;
      const p = products.find(prod => prod.id === item.productId);
      if (p) {
        p.currentStock = Math.max(0, (p.currentStock || 0) - item.quantity);
      }
    }
    localStorage.setItem('bar_pos_local_products', JSON.stringify(products));
  } catch (e) {
    console.error('Failed to deduct local product stock:', e);
  }
}

/**
 * Store sale locally and queue for sync
 */
export function saveSaleLocallyAndQueue(sale: Sale) {
  // 1. Save to local sales history
  try {
    const localSales: Sale[] = JSON.parse(localStorage.getItem('bar_pos_local_sales') || '[]');
    const exists = localSales.some(s => s.id === sale.id);
    if (!exists) {
      localSales.unshift(sale);
      localStorage.setItem('bar_pos_local_sales', JSON.stringify(localSales));
    }
  } catch (e) {
    console.error('Failed to write to bar_pos_local_sales:', e);
  }

  // 2. Queue for server sync
  const queue = getStoredPendingSales();
  if (!queue.some(s => s.id === sale.id)) {
    queue.push(sale);
    savePendingSales(queue);
  }

  // 3. Deduct local stock
  deductLocalProductStock(sale.items);
}

/**
 * Synchronize all pending sales to Firestore
 */
export async function syncOfflineQueue(): Promise<{ syncedCount: number; errors: number }> {
  if (isSyncing) {
    return { syncedCount: 0, errors: 0 };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { syncedCount: 0, errors: 0 };
  }

  const queue = getStoredPendingSales();
  if (queue.length === 0) {
    return { syncedCount: 0, errors: 0 };
  }

  isSyncing = true;
  notifyListeners();

  let syncedCount = 0;
  let errors = 0;
  const remainingQueue: Sale[] = [];

  for (const sale of queue) {
    try {
      // 1. Upload sale document
      const saleRef = doc(db, 'businesses', DEFAULT_BUSINESS_ID, 'sales', sale.id);
      await setDoc(saleRef, sale, { merge: true });

      // 2. Update stock in Firestore for inventory items
      for (const item of sale.items) {
        if (item.productId.startsWith('custom-')) continue;
        try {
          const prodRef = doc(db, 'businesses', DEFAULT_BUSINESS_ID, 'products', item.productId);
          await updateDoc(prodRef, {
            currentStock: increment(-item.quantity),
            updatedAt: new Date().toISOString()
          });
        } catch (stockErr) {
          console.warn(`Could not decrement stock online for ${item.productId}:`, stockErr);
        }
      }

      syncedCount++;
    } catch (err) {
      console.error(`Failed to sync sale ${sale.id}:`, err);
      errors++;
      remainingQueue.push(sale);
    }
  }

  // Update stored queue with any failed items
  savePendingSales(remainingQueue);
  localStorage.setItem('bar_pos_last_sync_time', new Date().toLocaleTimeString());

  isSyncing = false;
  notifyListeners();

  return { syncedCount, errors };
}

/**
 * Permanently delete all sales receipts, payment records, and daily shift closings
 * to start completely fresh with zero sales. Products, inventory, and users remain intact.
 */
export async function clearAllPaymentRecords(user?: { uid: string; name: string }): Promise<{ deletedSales: number; deletedClosings: number }> {
  // 1. Clear local caches immediately
  localStorage.removeItem('bar_pos_local_sales');
  localStorage.removeItem('bar_pos_offline_sales_queue');
  localStorage.removeItem('bar_pos_last_sync_time');
  notifyListeners();

  let deletedSales = 0;
  let deletedClosings = 0;

  // 2. Clear remote Firestore sales
  try {
    const salesSnap = await getDocs(collection(db, 'businesses', DEFAULT_BUSINESS_ID, 'sales'));
    for (const d of salesSnap.docs) {
      await deleteDoc(doc(db, 'businesses', DEFAULT_BUSINESS_ID, 'sales', d.id));
      deletedSales++;
    }
  } catch (e) {
    console.warn('Error clearing remote sales:', e);
  }

  // 3. Clear remote daily shift closings
  try {
    const closingsSnap = await getDocs(collection(db, 'businesses', DEFAULT_BUSINESS_ID, 'dailyClosings'));
    for (const d of closingsSnap.docs) {
      await deleteDoc(doc(db, 'businesses', DEFAULT_BUSINESS_ID, 'dailyClosings', d.id));
      deletedClosings++;
    }
  } catch (e) {
    console.warn('Error clearing remote dailyClosings:', e);
  }

  // 4. Clear remote cash reconciliations
  try {
    const reconciliationsSnap = await getDocs(collection(db, 'businesses', DEFAULT_BUSINESS_ID, 'cashReconciliations'));
    for (const d of reconciliationsSnap.docs) {
      await deleteDoc(doc(db, 'businesses', DEFAULT_BUSINESS_ID, 'cashReconciliations', d.id));
    }
  } catch (e) {
    console.warn('Error clearing remote cashReconciliations:', e);
  }

  if (user) {
    logAuditAction(user.uid, user.name, 'PAYMENTS_CLEARED', 'Cleared all payment records and sales receipts to start fresh').catch(() => {});
  }

  return { deletedSales, deletedClosings };
}
