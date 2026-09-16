import { db, DEFAULT_BUSINESS_ID } from './firebase';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { BusinessConfig, Category, Product, BusinessDay, UserProfile } from '../types';
import { DEFAULT_PHARMACY_CATEGORIES, DEFAULT_PHARMACY_PRODUCTS } from './chemistProductsData';

export { DEFAULT_PHARMACY_CATEGORIES, DEFAULT_PHARMACY_PRODUCTS };

export async function initializeDatabase(currentUser?: { uid: string; email?: string; displayName?: string }) {
  try {
    // 1. Check/Create Business Config for Alpha Chemist
    const bizRef = doc(db, 'businesses', DEFAULT_BUSINESS_ID);
    const bizSnap = await getDoc(bizRef);
    if (!bizSnap.exists()) {
      const defaultBiz: BusinessConfig = {
        id: DEFAULT_BUSINESS_ID,
        name: "Alpha Chemist",
        phone: "+254 712 345 678",
        location: "Nairobi CBD",
        address: "Kenyatta Avenue / Kimathi Street, Nairobi",
        currency: "KSh",
        openingTime: "07:30",
        closingTime: "22:00",
        lowStockThreshold: 10,
        receiptHeader: "ALPHA CHEMIST\nLicensed Retail Pharmacy & Medical Supplies\nPrescriptions • OTC Medicines • First Aid\nTel: +254 712 345 678",
        receiptFooter: "Get well soon! Please store medicines in a cool, dry place.\nConsult our pharmacist for proper dosage.",
        tillNumber: "882190",
        allowNegativeStock: false
      };
      await setDoc(bizRef, defaultBiz);
    } else {
      const currentData = bizSnap.data() as BusinessConfig;
      if (!currentData.name || currentData.name !== 'Alpha Chemist') {
        await setDoc(bizRef, {
          name: "Alpha Chemist",
          receiptHeader: "ALPHA CHEMIST\nLicensed Retail Pharmacy & Medical Supplies\nPrescriptions • OTC Medicines • First Aid\nTel: +254 712 345 678",
          receiptFooter: "Get well soon! Please store medicines in a cool, dry place.\nConsult our pharmacist for proper dosage.",
          tillNumber: currentData.tillNumber || "882190"
        }, { merge: true });
      }
    }

    const isNonChemistItem = (text: string) => {
      const t = text.toLowerCase();
      return t.includes('room') ||
             t.includes('hotel') ||
             t.includes('beer') ||
             t.includes('tusker') ||
             t.includes('heineken') ||
             t.includes('guinness') ||
             t.includes('smirnoff') ||
             t.includes('vodka') ||
             t.includes('whiskey') ||
             t.includes('cocktail') ||
             t.includes('tilapia') ||
             t.includes('pilau') ||
             t.includes('burger') ||
             t.includes('spa') ||
             t.includes('massage') ||
             t.includes('food court');
    };

    // 2. Check/Clean/Create Categories
    const catColRef = collection(db, 'businesses', DEFAULT_BUSINESS_ID, 'categories');
    const catSnap = await getDocs(catColRef);
    let hasNonChemistCat = false;
    for (const d of catSnap.docs) {
      const data = d.data();
      const text = (data.name || '') + ' ' + (data.description || '') + ' ' + d.id;
      if (isNonChemistItem(text)) {
        hasNonChemistCat = true;
        await deleteDoc(doc(catColRef, d.id)).catch(() => {});
      }
    }

    const defaultCategories = DEFAULT_PHARMACY_CATEGORIES;

    if (catSnap.empty || hasNonChemistCat) {
      for (const cat of defaultCategories) {
        await setDoc(doc(catColRef, cat.id), cat);
      }
    }

    // 3. Check/Clean/Create Products
    const prodColRef = collection(db, 'businesses', DEFAULT_BUSINESS_ID, 'products');
    const prodSnap = await getDocs(prodColRef);
    let hasNonChemistProd = false;
    for (const d of prodSnap.docs) {
      const data = d.data();
      const text = (data.name || '') + ' ' + (data.categoryName || '') + ' ' + d.id;
      if (isNonChemistItem(text)) {
        hasNonChemistProd = true;
        await deleteDoc(doc(prodColRef, d.id)).catch(() => {});
      }
    }

    const defaultProducts: Product[] = DEFAULT_PHARMACY_PRODUCTS;

    const _OLD_UNUSED_PRODS: any[] = [
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

    if (prodSnap.empty || hasNonChemistProd || prodSnap.size < 15) {
      for (const prod of defaultProducts) {
        await setDoc(doc(prodColRef, prod.id), prod, { merge: true });
      }
    } else {
      // Ensure all chemist products exist in Firestore
      for (const prod of defaultProducts) {
        const exists = prodSnap.docs.some(d => d.id === prod.id);
        if (!exists) {
          await setDoc(doc(prodColRef, prod.id), prod, { merge: true });
        }
      }
      // Backfill barcodes for products in Firestore missing barcode
      for (const d of prodSnap.docs) {
        const data = d.data();
        if (!data.barcode) {
          const match = defaultProducts.find(dp => dp.id === d.id);
          const barcodeVal = match?.barcode || `61611000${Math.floor(2000 + Math.random() * 7000)}`;
          await setDoc(doc(prodColRef, d.id), { barcode: barcodeVal }, { merge: true }).catch(() => {});
        }
      }
    }

    // 4. Check/Create Current Business Day
    const todayStr = new Date().toISOString().split('T')[0];
    const dayRef = doc(db, 'businesses', DEFAULT_BUSINESS_ID, 'businessDays', todayStr);
    const daySnap = await getDoc(dayRef);
    if (!daySnap.exists()) {
      const todayDay: BusinessDay = {
        id: todayStr,
        date: todayStr,
        openingTime: "07:30",
        closingTime: "22:00",
        openedBy: currentUser?.email || 'admin@alphachemist.com',
        status: 'open',
        createdAt: Date.now()
      };
      await setDoc(dayRef, todayDay);
    }

    // 5. Ensure user profile exists in Firestore users collection
    if (currentUser && currentUser.uid) {
      const userRef = doc(db, 'users', currentUser.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        const email = currentUser.email || '';
        const role = email.includes('cashier') ? 'cashier' : 'admin';
        const profile: UserProfile = {
          uid: currentUser.uid,
          email: email,
          name: currentUser.displayName || (role === 'admin' ? 'Lead Pharmacist' : 'Pharmacy Cashier & Dispenser'),
          role: role,
          businessId: DEFAULT_BUSINESS_ID,
          status: 'active',
          createdAt: new Date().toISOString()
        };
        await setDoc(userRef, profile);
      }
    }

  } catch (err) {
    console.error("Error initializing Alpha Chemist database seed:", err);
  }
}

/**
 * Manually or programmatically triggers complete seeding/updating of chemist products catalog
 */
export async function seedChemistProducts(force: boolean = false): Promise<{ success: boolean; count: number }> {
  try {
    const catColRef = collection(db, 'businesses', DEFAULT_BUSINESS_ID, 'categories');
    for (const cat of DEFAULT_PHARMACY_CATEGORIES) {
      await setDoc(doc(catColRef, cat.id), cat, { merge: true });
    }
    localStorage.setItem('bar_pos_local_categories', JSON.stringify(DEFAULT_PHARMACY_CATEGORIES));

    const prodColRef = collection(db, 'businesses', DEFAULT_BUSINESS_ID, 'products');
    const existingSnap = await getDocs(prodColRef);
    const existingIds = new Set(existingSnap.docs.map(d => d.id));

    let seededCount = 0;
    for (const prod of DEFAULT_PHARMACY_PRODUCTS) {
      if (force || !existingIds.has(prod.id)) {
        await setDoc(doc(prodColRef, prod.id), prod, { merge: true });
        seededCount++;
      }
    }

    // Synchronize local cache
    try {
      const existingCached = JSON.parse(localStorage.getItem('bar_pos_local_products') || '[]');
      const map = new Map<string, Product>();
      existingCached.forEach((p: Product) => map.set(p.id, p));
      DEFAULT_PHARMACY_PRODUCTS.forEach(p => {
        if (force || !map.has(p.id)) {
          map.set(p.id, p);
        }
      });
      const finalProds = Array.from(map.values());
      localStorage.setItem('bar_pos_local_products', JSON.stringify(finalProds));
      localStorage.setItem('bar_pos_products_cache_date', new Date().toISOString());
    } catch (e) {
      console.warn('Failed to update local cache during seedChemistProducts:', e);
    }

    return { success: true, count: seededCount };
  } catch (err) {
    console.error("Failed to seed chemist products:", err);
    return { success: false, count: 0 };
  }
}
