import React, { useEffect, useState, useRef } from 'react';
import { UserProfile, BusinessConfig, Product, Category } from '../../types';
import { db, DEFAULT_BUSINESS_ID } from '../../lib/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { formatCurrency, logAuditAction } from '../../lib/utils';
import { Package, Plus, Search, Edit2, Trash2, X, AlertCircle, Download, Upload, Layers, CheckCircle2, Sparkles, Check, Barcode, Printer, Maximize2, Copy } from 'lucide-react';
import { generateBarcode, isBarcodeDuplicate, detectBarcodeFormat, cleanScannedBarcode } from '../../lib/barcodeUtils';
import { BarcodeDisplay } from '../common/BarcodeDisplay';
import { BarcodeLabelPrintModal } from '../common/BarcodeLabelPrintModal';
import { BulkBarcodePrintModal } from '../common/BulkBarcodePrintModal';
import { DEFAULT_PHARMACY_CATEGORIES, DEFAULT_PHARMACY_PRODUCTS, seedChemistProducts } from '../../lib/dbSeeder';

interface ProductsViewProps {
  user: UserProfile;
  businessConfig?: BusinessConfig | null;
}

export function ProductsView({ user, businessConfig }: ProductsViewProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isSeedingChemist, setIsSeedingChemist] = useState(false);
  const [seedingSuccessToast, setSeedingSuccessToast] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('');
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // Category Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [catError, setCatError] = useState('');
  const [catSuccess, setCatSuccess] = useState('');
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);
  const [isDeletingCat, setIsDeletingCat] = useState(false);

  // Product Delete Modal State
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [isDeletingProduct, setIsDeletingProduct] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    barcode: '',
    categoryId: '',
    unitType: 'Tablet' as Product['unitType'],
    buyingPrice: 0,
    sellingPrice: 0,
    openingStock: 0,
    currentStock: 0,
    minStockLevel: 10
  });
  const [error, setError] = useState('');

  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [isBulkPrintModalOpen, setIsBulkPrintModalOpen] = useState(false);
  const [bulkPrintInitialIds, setBulkPrintInitialIds] = useState<string[]>([]);
  const [isAutoAssigningBarcodes, setIsAutoAssigningBarcodes] = useState(false);
  const [labelPrintProduct, setLabelPrintProduct] = useState<Product | null>(null);
  const [enlargedBarcodeProduct, setEnlargedBarcodeProduct] = useState<{ name: string; barcode: string } | null>(null);
  const [copiedBarcode, setCopiedBarcode] = useState(false);

  const foodCourtTerms = [
    'hotel', 'room', 'beer', 'tusker', 'white cap', 'guinness', 'heineken',
    'smirnoff', 'vodka', 'whiskey', 'cocktail', 'tilapia', 'pilau', 'burger',
    'spa', 'massage', 'food court'
  ];

  const isFoodCourtText = (text: string) => {
    const t = text.toLowerCase();
    return foodCourtTerms.some(term => t.includes(term));
  };

  useEffect(() => {
    fetchProductsAndCategories();
  }, []);

  async function fetchProductsAndCategories() {
    try {
      const prodRef = collection(db, 'businesses', DEFAULT_BUSINESS_ID, 'products');
      const prodSnap = await getDocs(prodRef);
      const prods: Product[] = [];
      prodSnap.forEach(d => {
        const data = d.data();
        const text = (data.name || '') + ' ' + (data.categoryName || '') + ' ' + d.id;
        if (!isFoodCourtText(text)) {
          prods.push({ id: d.id, ...data } as Product);
        } else {
          // Purge food/bar products from Firestore in background
          deleteDoc(doc(prodRef, d.id)).catch(() => {});
        }
      });

      // If no chemist products exist in Firestore, seed them automatically
      if (prods.length === 0) {
        await seedChemistProducts(false);
        const refetchSnap = await getDocs(prodRef);
        refetchSnap.forEach(d => {
          const data = d.data();
          const text = (data.name || '') + ' ' + (data.categoryName || '') + ' ' + d.id;
          if (!isFoodCourtText(text)) {
            prods.push({ id: d.id, ...data } as Product);
          }
        });
      }
      setProducts(prods);

      const catRef = collection(db, 'businesses', DEFAULT_BUSINESS_ID, 'categories');
      const catSnap = await getDocs(catRef);
      const cats: Category[] = [];
      catSnap.forEach(d => {
        const data = d.data();
        const text = (data.name || '') + ' ' + (data.description || '') + ' ' + d.id;
        if (!isFoodCourtText(text)) {
          cats.push({ id: d.id, ...data } as Category);
        } else {
          // Purge food/bar categories from Firestore in background
          deleteDoc(doc(catRef, d.id)).catch(() => {});
        }
      });
      if (cats.length === 0) {
        for (const c of DEFAULT_PHARMACY_CATEGORIES) {
          cats.push(c);
        }
      }
      setCategories(cats);
    } catch (err) {
      console.warn("Using local fallback products:", err);
      try {
        const localProds = JSON.parse(localStorage.getItem('bar_pos_local_products') || '[]');
        const localCats = JSON.parse(localStorage.getItem('bar_pos_local_categories') || '[]');
        const filteredP = localProds.filter((p: Product) => !isFoodCourtText(p.name + ' ' + (p.categoryName || '')));
        const filteredC = localCats.filter((c: Category) => !isFoodCourtText(c.name + ' ' + (c.description || '')));
        setProducts(filteredP.length > 0 ? filteredP : DEFAULT_PHARMACY_PRODUCTS);
        setCategories(filteredC.length > 0 ? filteredC : DEFAULT_PHARMACY_CATEGORIES);
      } catch (e) {
        setProducts(DEFAULT_PHARMACY_PRODUCTS);
        setCategories(DEFAULT_PHARMACY_CATEGORIES);
      }
    } finally {
      setLoading(false);
    }
  }

  const handleSeedChemistCatalog = async (force: boolean = false) => {
    setIsSeedingChemist(true);
    try {
      const res = await seedChemistProducts(force);
      await fetchProductsAndCategories();
      setSeedingSuccessToast(`Successfully loaded ${res.count || 'all'} chemist products!`);
      setTimeout(() => setSeedingSuccessToast(''), 4500);
      logAuditAction(user.uid, user.name, 'BULK_IMPORT', `Loaded standard Alpha Chemist pharmaceutical catalog (${res.count || 'all'} items)`);
    } catch (e) {
      console.error("Failed to seed chemist catalog:", e);
    } finally {
      setIsSeedingChemist(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) {
      setCatError('Category name is required');
      return;
    }
    try {
      const catId = 'cat-' + Date.now();
      const newCat: Category = {
        id: catId,
        name: newCatName.trim(),
        description: newCatDesc.trim() || 'Pharmacy category'
      };
      await setDoc(doc(db, 'businesses', DEFAULT_BUSINESS_ID, 'categories', catId), newCat);
      const updatedCats = [...categories, newCat];
      setCategories(updatedCats);
      localStorage.setItem('bar_pos_local_categories', JSON.stringify(updatedCats));
      await logAuditAction(user.uid, user.name, 'CATEGORY_CREATED', `Created category ${newCat.name}`, catId);
      setNewCatName('');
      setNewCatDesc('');
      setCatError('');
      setCatSuccess(`Category "${newCat.name}" added successfully.`);
    } catch (err: any) {
      setCatError(err.message || 'Failed to add category');
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    setIsDeletingCat(true);
    setCatError('');
    setCatSuccess('');
    try {
      try {
        await deleteDoc(doc(db, 'businesses', DEFAULT_BUSINESS_ID, 'categories', cat.id));
      } catch (firestoreErr) {
        console.warn('Firestore category deleteDoc warning:', firestoreErr);
      }

      const updatedCats = categories.filter(c => c.id !== cat.id);
      setCategories(updatedCats);
      localStorage.setItem('bar_pos_local_categories', JSON.stringify(updatedCats));

      if (selectedCategory === cat.id) {
        setSelectedCategory('all');
      }

      // Update products that reference this category
      const updatedProds = products.map(p => {
        if (p.categoryId === cat.id) {
          return { ...p, categoryId: '', categoryName: 'Uncategorized' };
        }
        return p;
      });
      setProducts(updatedProds);
      localStorage.setItem('bar_pos_local_products', JSON.stringify(updatedProds));

      await logAuditAction(user.uid, user.name, 'CATEGORY_DELETED', `Deleted category ${cat.name}`, cat.id);
      setCatSuccess(`Category "${cat.name}" has been deleted.`);
      setDeletingCatId(null);
    } catch (err: any) {
      setCatError(err.message || 'Failed to delete category');
    } finally {
      setIsDeletingCat(false);
    }
  };

  const hasFoodCourtCategories = categories.some(cat => {
    const text = (cat.name + ' ' + (cat.description || '') + ' ' + cat.id).toLowerCase();
    return foodCourtTerms.some(t => text.includes(t));
  });

  const handleBatchDeleteFoodCourtCategories = async () => {
    setIsDeletingCat(true);
    setCatError('');
    setCatSuccess('');
    try {
      const toDelete = categories.filter(cat => {
        const text = (cat.name + ' ' + (cat.description || '') + ' ' + cat.id).toLowerCase();
        return foodCourtTerms.some(t => text.includes(t));
      });

      for (const cat of toDelete) {
        await deleteDoc(doc(db, 'businesses', DEFAULT_BUSINESS_ID, 'categories', cat.id)).catch(() => {});
      }

      const remaining = categories.filter(cat => {
        const text = (cat.name + ' ' + (cat.description || '') + ' ' + cat.id).toLowerCase();
        return !foodCourtTerms.some(t => text.includes(t));
      });

      if (remaining.length === 0) {
        for (const c of DEFAULT_PHARMACY_CATEGORIES) {
          await setDoc(doc(db, 'businesses', DEFAULT_BUSINESS_ID, 'categories', c.id), c).catch(() => {});
        }
        setCategories(DEFAULT_PHARMACY_CATEGORIES);
        localStorage.setItem('bar_pos_local_categories', JSON.stringify(DEFAULT_PHARMACY_CATEGORIES));
      } else {
        setCategories(remaining);
        localStorage.setItem('bar_pos_local_categories', JSON.stringify(remaining));
      }

      setSelectedCategory('all');
      setCatSuccess(`Removed all legacy food court categories successfully.`);
      await logAuditAction(user.uid, user.name, 'CATEGORIES_CLEANED', 'Purged legacy food court categories', 'batch');
    } catch (err: any) {
      setCatError(err.message || 'Failed to remove legacy categories');
    } finally {
      setIsDeletingCat(false);
    }
  };

  const handleExportCSV = () => {
    if (products.length === 0) {
      alert("No products to export.");
      return;
    }
    const headers = ['id', 'name', 'barcode', 'categoryId', 'categoryName', 'unitType', 'buyingPrice', 'sellingPrice', 'openingStock', 'currentStock', 'minStockLevel'];
    const csvRows = [headers.join(',')];

    products.forEach(p => {
      const row = [
        p.id,
        `"${(p.name || '').replace(/"/g, '""')}"`,
        `"${(p.barcode || '').replace(/"/g, '""')}"`,
        p.categoryId || 'cat-beer',
        `"${(p.categoryName || 'Beers').replace(/"/g, '""')}"`,
        p.unitType || 'Bottle',
        p.buyingPrice || 0,
        p.sellingPrice || 0,
        p.openingStock || 0,
        p.currentStock || 0,
        p.minStockLevel || 10
      ];
      csvRows.push(row.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `products_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) return;
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        if (lines.length < 2) {
          alert("Invalid CSV file format. Must contain header and product rows.");
          return;
        }

        // Parse header
        const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const nameIdx = header.indexOf('name');
        const barcodeIdx = header.indexOf('barcode');
        const catIdIdx = header.indexOf('categoryId');
        const catNameIdx = header.indexOf('categoryName');
        const unitIdx = header.indexOf('unitType');
        const buyIdx = header.indexOf('buyingPrice');
        const sellIdx = header.indexOf('sellingPrice');
        const stockIdx = header.indexOf('openingStock');
        const minIdx = header.indexOf('minStockLevel');

        if (nameIdx === -1 || sellIdx === -1) {
          alert("CSV must at least have 'name' and 'sellingPrice' columns.");
          return;
        }

        let importedCount = 0;
        const newProds = [...products];
        const now = new Date().toISOString();

        for (let i = 1; i < lines.length; i++) {
          const rowLine = lines[i];
          // Robust CSV line parser handling commas inside quotes and missing fields
          const cleanRow: string[] = [];
          let currentVal = '';
          let inQuotes = false;
          for (let c = 0; c < rowLine.length; c++) {
            const char = rowLine[c];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              cleanRow.push(currentVal.trim().replace(/^"|"$/g, ''));
              currentVal = '';
            } else {
              currentVal += char;
            }
          }
          cleanRow.push(currentVal.trim().replace(/^"|"$/g, ''));

          const name = (nameIdx !== -1 && cleanRow[nameIdx]) ? cleanRow[nameIdx] : `Product ${i}`;
          const rawBarcode = (barcodeIdx !== -1 && cleanRow[barcodeIdx]) ? cleanRow[barcodeIdx].trim() : '';
          const barcode = rawBarcode || generateBarcode('EAN-13');
          const categoryId = (catIdIdx !== -1 && cleanRow[catIdIdx]) ? cleanRow[catIdIdx] : categories[0]?.id || 'cat-antibiotics';
          const categoryName = (catNameIdx !== -1 && cleanRow[catNameIdx]) ? cleanRow[catNameIdx] : 'Antibiotics & Anti-Infectives';
          const unitType = (unitIdx !== -1 && cleanRow[unitIdx]) ? cleanRow[unitIdx] as Product['unitType'] : 'Tablet';
          const buyingPrice = (buyIdx !== -1 && !isNaN(Number(cleanRow[buyIdx]))) ? Number(cleanRow[buyIdx]) : 150;
          const sellingPrice = (sellIdx !== -1 && !isNaN(Number(cleanRow[sellIdx]))) ? Number(cleanRow[sellIdx]) : 250;
          const openingStock = (stockIdx !== -1 && !isNaN(Number(cleanRow[stockIdx]))) ? Number(cleanRow[stockIdx]) : 50;
          const minStockLevel = (minIdx !== -1 && !isNaN(Number(cleanRow[minIdx]))) ? Number(cleanRow[minIdx]) : 10;

          const productId = 'prod-' + Date.now() + '-' + i;
          const chemistUnits = ['Tablet', 'Capsule', 'Strip', 'Blister Pack', 'Bottle', 'Syrup (100ml)', 'Syrup (200ml)', 'Box', 'Tube', 'Sachet', 'Vial', 'Ampoule', 'Roll', 'Piece', 'Pack', 'Dose'];
          const newProd: Product = {
            id: productId,
            name,
            barcode,
            categoryId,
            categoryName,
            unitType: chemistUnits.includes(unitType) ? unitType : 'Tablet',
            buyingPrice,
            sellingPrice,
            openingStock,
            currentStock: openingStock,
            stockAdded: 0,
            minStockLevel,
            status: 'active',
            createdAt: now,
            updatedAt: now
          };

          try {
            await setDoc(doc(db, 'businesses', DEFAULT_BUSINESS_ID, 'products', productId), newProd);
          } catch (err) {
            // Firestore permission fallback
          }
          newProds.unshift(newProd);
          importedCount++;
        }

        setProducts(newProds);
        localStorage.setItem('bar_pos_local_products', JSON.stringify(newProds));
        await logAuditAction(user.uid, user.name, 'PRODUCTS_IMPORTED', `Imported ${importedCount} products via CSV`);
        alert(`Successfully imported ${importedCount} products!`);
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchProductsAndCategories();
      } catch (err: any) {
        console.error(err);
        alert('Failed to parse CSV file: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleDeleteAllProducts = async () => {
    if (products.length === 0) return;
    setIsDeletingAll(true);
    try {
      // Delete all products from Firestore
      for (const p of products) {
        try {
          await deleteDoc(doc(db, 'businesses', DEFAULT_BUSINESS_ID, 'products', p.id));
        } catch (err) {
          console.warn(`Could not delete product ${p.id} from Firestore`, err);
        }
      }
      setProducts([]);
      localStorage.setItem('bar_pos_local_products', JSON.stringify([]));
      await logAuditAction(user.uid, user.name, 'PRODUCTS_DELETED_ALL', `Deleted all ${products.length} products from catalog`);
      setIsDeleteAllModalOpen(false);
      setDeleteAllConfirmText('');
    } catch (err: any) {
      console.error(err);
      alert('Failed to delete all products: ' + err.message);
    } finally {
      setIsDeletingAll(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      barcode: generateBarcode('EAN-13'),
      categoryId: categories[0]?.id || 'cat-antibiotics',
      unitType: 'Tablet',
      buyingPrice: 150,
      sellingPrice: 250,
      openingStock: 50,
      currentStock: 50,
      minStockLevel: 10
    });
    setError('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      barcode: product.barcode || '',
      categoryId: product.categoryId,
      unitType: product.unitType,
      buyingPrice: product.buyingPrice || 0,
      sellingPrice: product.sellingPrice,
      openingStock: product.openingStock || 0,
      currentStock: product.currentStock || 0,
      minStockLevel: product.minStockLevel
    });
    setError('');
    setIsModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Product name is required');
      return;
    }

    const cleanBarcode = formData.barcode.trim();
    if (cleanBarcode) {
      if (isBarcodeDuplicate(products, cleanBarcode, editingProduct?.id)) {
        const dup = products.find(p => p.barcode === cleanBarcode && p.id !== editingProduct?.id);
        setError(`Barcode "${cleanBarcode}" is already assigned to "${dup?.name || 'another product'}". Barcodes must be unique.`);
        return;
      }
    }

    try {
      const cat = categories.find(c => c.id === formData.categoryId);
      const categoryName = cat ? cat.name : 'General';
      const now = new Date().toISOString();

      if (editingProduct) {
        // Edit
        const prodRef = doc(db, 'businesses', DEFAULT_BUSINESS_ID, 'products', editingProduct.id);
        const updatedData: any = {
          name: formData.name.trim(),
          barcode: cleanBarcode || null,
          categoryId: formData.categoryId,
          categoryName,
          unitType: formData.unitType,
          buyingPrice: Number(formData.buyingPrice),
          sellingPrice: Number(formData.sellingPrice),
          openingStock: Number(formData.openingStock),
          currentStock: Number(formData.currentStock),
          minStockLevel: Number(formData.minStockLevel),
          updatedAt: now
        };
        await updateDoc(prodRef, updatedData);
        await logAuditAction(user.uid, user.name, 'PRODUCT_EDITED', `Updated product ${formData.name}`, editingProduct.id);
      } else {
        // Create
        const productId = 'prod-' + Date.now();
        const newProduct: Product = {
          id: productId,
          name: formData.name.trim(),
          barcode: cleanBarcode || undefined,
          categoryId: formData.categoryId,
          categoryName,
          unitType: formData.unitType,
          buyingPrice: Number(formData.buyingPrice),
          sellingPrice: Number(formData.sellingPrice),
          openingStock: Number(formData.openingStock),
          currentStock: Number(formData.openingStock),
          stockAdded: 0,
          minStockLevel: Number(formData.minStockLevel),
          status: 'active',
          createdAt: now,
          updatedAt: now
        };
        const prodRef = doc(db, 'businesses', DEFAULT_BUSINESS_ID, 'products', productId);
        await setDoc(prodRef, newProduct);
        await logAuditAction(user.uid, user.name, 'PRODUCT_CREATED', `Created product ${formData.name}`, productId);
      }

      setIsModalOpen(false);
      await fetchProductsAndCategories();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to save product');
    }
  };

  const handleConfirmDeleteProduct = async (product: Product) => {
    setIsDeletingProduct(true);
    setError('');
    try {
      try {
        await deleteDoc(doc(db, 'businesses', DEFAULT_BUSINESS_ID, 'products', product.id));
      } catch (firestoreErr) {
        console.warn('Firestore product deleteDoc warning:', firestoreErr);
      }
      const updated = products.filter(p => p.id !== product.id);
      setProducts(updated);
      localStorage.setItem('bar_pos_local_products', JSON.stringify(updated));
      await logAuditAction(user.uid, user.name, 'PRODUCT_DELETED', `Deleted product ${product.name}`, product.id);
      setDeletingProduct(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to delete product');
    } finally {
      setIsDeletingProduct(false);
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesCat = selectedCategory === 'all' || p.categoryId === selectedCategory;
    const query = searchQuery.toLowerCase().trim();
    const cleanQ = cleanScannedBarcode(searchQuery).toLowerCase();
    const matchesSearch = !query ||
                          p.name.toLowerCase().includes(query) ||
                          p.categoryName.toLowerCase().includes(query) ||
                          (p.genericName && p.genericName.toLowerCase().includes(query)) ||
                          (p.barcode && (p.barcode.toLowerCase().includes(query) || (cleanQ && p.barcode.toLowerCase().includes(cleanQ))));
    return matchesCat && matchesSearch;
  });

  // Count products missing a registered barcode
  const missingBarcodeProducts = products.filter(p => !p.barcode || !p.barcode.trim());

  // Handle batch barcode auto-generation for items missing one
  const handleAutoAssignMissingBarcodes = async () => {
    if (missingBarcodeProducts.length === 0) return;
    setIsAutoAssigningBarcodes(true);
    try {
      const updatedProducts = [...products];
      let assignedCount = 0;
      for (const prod of missingBarcodeProducts) {
        const newCode = generateBarcode('EAN-13');
        const prodRef = doc(db, 'businesses', DEFAULT_BUSINESS_ID, 'products', prod.id);
        await updateDoc(prodRef, { barcode: newCode }).catch(async () => {
          await setDoc(prodRef, { barcode: newCode }, { merge: true });
        });
        const idx = updatedProducts.findIndex(p => p.id === prod.id);
        if (idx !== -1) {
          updatedProducts[idx] = { ...updatedProducts[idx], barcode: newCode };
        }
        assignedCount++;
      }
      setProducts(updatedProducts);
      setSeedingSuccessToast(`Generated unique EAN-13 barcodes for ${assignedCount} products!`);
      setTimeout(() => setSeedingSuccessToast(''), 4500);
      logAuditAction(user.uid, user.name, 'UPDATE', `Auto-assigned barcodes to ${assignedCount} products`);
    } catch (e) {
      console.error("Failed to auto-assign barcodes:", e);
    } finally {
      setIsAutoAssigningBarcodes(false);
    }
  };

  // Toggle selection for a product row
  const handleToggleSelectProduct = (productId: string) => {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  // Toggle select all filtered products
  const handleSelectAllFiltered = () => {
    setSelectedProductIds(prev => {
      const allFilteredSelected = filteredProducts.length > 0 && filteredProducts.every(p => prev.has(p.id));
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredProducts.forEach(p => next.delete(p.id));
      } else {
        filteredProducts.forEach(p => next.add(p.id));
      }
      return next;
    });
  };

  // Open Bulk Barcode Print Modal
  const handleOpenBulkPrint = (targetIds?: string[]) => {
    if (targetIds && targetIds.length > 0) {
      setBulkPrintInitialIds(targetIds);
    } else if (selectedProductIds.size > 0) {
      setBulkPrintInitialIds(Array.from(selectedProductIds));
    } else {
      setBulkPrintInitialIds([]); // empty means all products
    }
    setIsBulkPrintModalOpen(true);
  };

  const currency = businessConfig?.currency || 'KSh';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Product & Medicine Management</h2>
          <p className="text-sm text-gray-500">Manage pharmacy inventory, prescriptions, OTC medicines, and pricing</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportCSV}
            accept=".csv"
            className="hidden"
          />
          {/* Print All Barcodes Button */}
          <button
            onClick={() => handleOpenBulkPrint()}
            disabled={products.length === 0}
            className="inline-flex items-center space-x-2 rounded-2xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-3 text-sm font-bold text-white shadow-md shadow-emerald-700/20 transition-all active:scale-95 cursor-pointer"
            title="Batch print barcodes and shelf tags for catalog"
          >
            <Printer className="w-4 h-4 text-emerald-200" />
            <span>
              {selectedProductIds.size > 0
                ? `Print Selected Barcodes (${selectedProductIds.size})`
                : `Print All Barcodes (${products.length})`}
            </span>
          </button>

          <button
            onClick={() => handleSeedChemistCatalog(false)}
            disabled={isSeedingChemist}
            className="inline-flex items-center space-x-2 rounded-2xl bg-teal-50 border border-teal-200 hover:bg-teal-100 disabled:opacity-50 px-4 py-3 text-sm font-bold text-teal-800 shadow-sm transition-all active:scale-95 cursor-pointer"
            title="Load or restore standard chemist products catalog"
          >
            <Sparkles className="w-4 h-4 text-teal-600" />
            <span>{isSeedingChemist ? 'Loading Catalog...' : 'Add Chemist Products'}</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center space-x-2 rounded-2xl bg-white border border-gray-300 hover:bg-gray-50 px-4 py-3 text-sm font-bold text-gray-700 shadow-sm transition-all active:scale-95"
            title="Import Products from CSV"
          >
            <Upload className="w-4 h-4 text-gray-500" />
            <span>Import CSV</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center space-x-2 rounded-2xl bg-white border border-gray-300 hover:bg-gray-50 px-4 py-3 text-sm font-bold text-gray-700 shadow-sm transition-all active:scale-95"
            title="Export Products to CSV"
          >
            <Download className="w-4 h-4 text-gray-500" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => {
              setCatError('');
              setNewCatName('');
              setNewCatDesc('');
              setIsCategoryModalOpen(true);
            }}
            className="inline-flex items-center space-x-2 rounded-2xl bg-white border border-gray-300 hover:bg-gray-50 px-4 py-3 text-sm font-bold text-gray-700 shadow-sm transition-all active:scale-95"
          >
            <Layers className="w-4 h-4 text-emerald-600" />
            <span>Manage Categories</span>
          </button>
          <button
            onClick={() => {
              setDeleteAllConfirmText('');
              setIsDeleteAllModalOpen(true);
            }}
            disabled={products.length === 0}
            className="inline-flex items-center space-x-2 rounded-2xl bg-red-50 border border-red-200 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-3 text-sm font-bold text-red-600 shadow-sm transition-all active:scale-95"
            title="Delete All Products"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
            <span>Delete All</span>
          </button>
          <button
            onClick={handleOpenAddModal}
            className="inline-flex items-center space-x-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/30 transition-all active:scale-95"
          >
            <Plus className="w-5 h-5" />
            <span>Add New Product</span>
          </button>
        </div>
      </div>

      {seedingSuccessToast && (
        <div className="flex items-center space-x-2 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-sm font-bold text-emerald-800 shadow-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{seedingSuccessToast}</span>
        </div>
      )}

      {/* Contextual Multi-Item Selection Bar */}
      {selectedProductIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 text-white p-4 rounded-2xl shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center space-x-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm font-bold">
              {selectedProductIds.size} {selectedProductIds.size === 1 ? 'medicine' : 'medicines'} selected
            </span>
            <span className="text-xs text-slate-400">
              (out of {products.length} catalog items)
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleOpenBulkPrint(Array.from(selectedProductIds))}
              className="inline-flex items-center space-x-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Barcodes for Selected ({selectedProductIds.size})</span>
            </button>
            <button
              onClick={() => setSelectedProductIds(new Set(filteredProducts.map(p => p.id)))}
              className="inline-flex items-center space-x-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 cursor-pointer"
            >
              <span>Select All Filtered ({filteredProducts.length})</span>
            </button>
            <button
              onClick={() => setSelectedProductIds(new Set())}
              className="inline-flex items-center space-x-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear Selection</span>
            </button>
          </div>
        </div>
      )}

      {/* Missing Barcodes Quick-Fix Alert */}
      {missingBarcodeProducts.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-900 shadow-2xs">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>{missingBarcodeProducts.length}</strong> {missingBarcodeProducts.length === 1 ? 'medicine lacks' : 'medicines lack'} a registered barcode.
            </span>
          </div>
          <button
            onClick={handleAutoAssignMissingBarcodes}
            disabled={isAutoAssigningBarcodes}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isAutoAssigningBarcodes ? 'Assigning Barcodes...' : 'Auto-Generate Missing Barcodes'}</span>
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search medicines, generic names, categories, or barcodes..."
            className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
          />
        </div>

        <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              selectedCategory === 'all'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            All Categories
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCategory === cat.id
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Products Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 font-medium">Loading pharmacy products...</div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white rounded-3xl border border-gray-200 shadow-xs">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
            <Package className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">
            {products.length === 0 ? 'No Chemist Products in Catalog' : 'No Matching Medicines Found'}
          </h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
            {products.length === 0
              ? 'Your pharmacy catalog is currently empty. Click below to load our standard catalog of 70+ essential chemist medicines, supplies, and diagnostics.'
              : `No items matched "${searchQuery}" in ${selectedCategory === 'all' ? 'any category' : 'the selected category'}. Try adjusting your search term or filter.`}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {products.length === 0 ? (
              <>
                <button
                  onClick={() => handleSeedChemistCatalog(true)}
                  disabled={isSeedingChemist}
                  className="inline-flex items-center space-x-2 rounded-2xl bg-teal-600 hover:bg-teal-700 px-5 py-3 text-sm font-bold text-white shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{isSeedingChemist ? 'Loading Catalog...' : 'Load 70+ Chemist Products'}</span>
                </button>
                <button
                  onClick={handleOpenAddModal}
                  className="inline-flex items-center space-x-2 rounded-2xl bg-white border border-gray-300 hover:bg-gray-50 px-5 py-3 text-sm font-bold text-gray-700 shadow-sm transition-all active:scale-95 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Custom Product</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}
                className="inline-flex items-center space-x-2 rounded-2xl bg-teal-50 text-teal-700 hover:bg-teal-100 px-4 py-2.5 text-sm font-bold transition-all cursor-pointer"
              >
                <span>Clear Search & Filter</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500">
                  <th className="p-4 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={
                        filteredProducts.length > 0 &&
                        filteredProducts.every(p => selectedProductIds.has(p.id))
                      }
                      onChange={handleSelectAllFiltered}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      title="Select / Deselect all filtered medicines"
                    />
                  </th>
                  <th className="p-4">Product Name</th>
                  <th className="p-4">Barcode</th>
                  <th className="p-4">Category</th>
                  <th className="p-4">Unit</th>
                  <th className="p-4 text-right">Selling Price</th>
                  <th className="p-4 text-center">Opening Stock</th>
                  <th className="p-4 text-center">Current Stock</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredProducts.map(product => (
                  <tr
                    key={product.id}
                    className={`hover:bg-gray-50/80 transition-colors ${
                      selectedProductIds.has(product.id) ? 'bg-emerald-50/40' : ''
                    }`}
                  >
                    <td className="p-4 text-center">
                      <input
                        type="checkbox"
                        checked={selectedProductIds.has(product.id)}
                        onChange={() => handleToggleSelectProduct(product.id)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                    </td>
                    <td className="p-4 font-bold text-gray-900">{product.name}</td>
                    <td className="p-4">
                      {product.barcode ? (
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => setEnlargedBarcodeProduct({ name: product.name, barcode: product.barcode! })}
                            className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-all select-all flex items-center space-x-1.5 cursor-pointer shadow-2xs"
                            title="Click to view enlarged barcode"
                          >
                            <Barcode className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{product.barcode}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setLabelPrintProduct(product)}
                            className="text-slate-500 hover:text-emerald-700 p-1.5 rounded-lg hover:bg-emerald-50 transition-all cursor-pointer"
                            title="Print Barcode Label"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No Barcode</span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                        {product.categoryName}
                      </span>
                    </td>
                    <td className="p-4 text-gray-600">{product.unitType}</td>
                    <td className="p-4 text-right font-black text-emerald-700">
                      {formatCurrency(product.sellingPrice, currency)}
                    </td>
                    <td className="p-4 text-center font-medium text-gray-700">{product.openingStock}</td>
                    <td className="p-4 text-center font-bold text-gray-900">{product.currentStock}</td>
                    <td className="p-4 text-right space-x-2">
                      <button
                        onClick={() => setLabelPrintProduct(product)}
                        className="p-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all cursor-pointer"
                        title="Print Barcode Label"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleOpenEditModal(product)}
                        className="p-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all"
                        title="Edit Product"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeletingProduct(product)}
                        className="p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-all"
                        title="Delete Product"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4 backdrop-blur-xs">
          <form
            onSubmit={handleSaveProduct}
            className="w-full max-w-lg rounded-3xl bg-white shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[90vh] overflow-hidden"
          >
            {/* Sticky Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 bg-white rounded-t-3xl shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900">
                    {editingProduct ? 'Edit Product' : 'Create New Product'}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {editingProduct ? 'Update product details and barcode' : 'Add inventory item to your catalog'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {error && (
                <div className="flex items-center space-x-2 rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{error}</span>
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-900">
                    Product Name
                  </label>
                  {!editingProduct && (
                    <select
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        if (!selectedId) return;
                        const preset = DEFAULT_PHARMACY_PRODUCTS.find(p => p.id === selectedId);
                        if (preset) {
                          setFormData({
                            name: preset.name,
                            barcode: preset.barcode || generateBarcode('EAN-13'),
                            categoryId: preset.categoryId,
                            unitType: preset.unitType,
                            buyingPrice: preset.buyingPrice || 0,
                            sellingPrice: preset.sellingPrice,
                            openingStock: preset.openingStock,
                            currentStock: preset.currentStock,
                            minStockLevel: preset.minStockLevel || 10
                          });
                        }
                      }}
                      defaultValue=""
                      className="text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg px-2.5 py-1 transition-all cursor-pointer focus:outline-none"
                    >
                      <option value="" disabled>⚡ Quick-Fill Medicine Preset...</option>
                      {DEFAULT_PHARMACY_PRODUCTS.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.categoryName})</option>
                      ))}
                    </select>
                  )}
                </div>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Amoxicillin 500mg Capsules or Panadol Extra"
                  className="w-full rounded-xl border border-slate-300 p-3 text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 bg-white"
                />
              </div>

              {/* Product Barcode Field */}
              <div className="space-y-2 p-4 rounded-2xl bg-slate-50 border-2 border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold uppercase tracking-wider text-slate-900 flex items-center space-x-1.5">
                    <Barcode className="w-4 h-4 text-slate-700" />
                    <span>Product Barcode (EAN-13 / Code 128)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const generated = generateBarcode('EAN-13');
                      setFormData({ ...formData, barcode: generated });
                    }}
                    className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 px-3 py-1.5 rounded-xl shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Auto-Generate</span>
                  </button>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={formData.barcode}
                    onChange={(e) => {
                      const val = e.target.value;
                      const cleaned = cleanScannedBarcode(val);
                      setFormData({ ...formData, barcode: cleaned || val.trim() });
                    }}
                    placeholder="Scan with barcode scanner or enter code..."
                    className="w-full rounded-xl border-2 border-slate-300 bg-white p-3 font-mono text-base font-extrabold text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 tracking-wider"
                  />
                  {formData.barcode && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, barcode: '' })}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {formData.barcode && (
                  <div className="mt-2 p-4 bg-white rounded-xl border-2 border-slate-200 flex flex-col items-center space-y-3 shadow-2xs">
                    <BarcodeDisplay
                      value={formData.barcode}
                      height={75}
                      width={2.2}
                      fontSize={16}
                      className="w-full max-w-sm"
                    />

                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <span className="font-mono text-base font-black text-slate-900 bg-slate-100 px-3.5 py-1 rounded-lg border border-slate-300 tracking-widest select-all">
                        {formData.barcode}
                      </span>
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-900 text-white">
                        {detectBarcodeFormat(formData.barcode)}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setEnlargedBarcodeProduct({ name: formData.name || 'Product Barcode', barcode: formData.barcode })}
                        className="text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer"
                      >
                        <Maximize2 className="w-3.5 h-3.5 text-slate-700" />
                        <span>Enlarge Barcode</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(formData.barcode);
                          setCopiedBarcode(true);
                          setTimeout(() => setCopiedBarcode(false), 2000);
                        }}
                        className="text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer"
                      >
                        {copiedBarcode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-700" />}
                        <span>{copiedBarcode ? 'Copied!' : 'Copy Code'}</span>
                      </button>
                    </div>

                    {isBarcodeDuplicate(products, formData.barcode, editingProduct?.id) && (
                      <p className="text-xs font-bold text-red-600 mt-1 flex items-center space-x-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Warning: This barcode is already used by another product!</span>
                      </p>
                    )}
                  </div>
                )}
                <p className="text-xs font-medium text-slate-600">
                  Unique barcode within your business. Can be scanned directly from the POS interface.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-900 mb-1.5">
                    Category
                  </label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 p-3 text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 bg-white"
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-900 mb-1.5">
                    Unit Type
                  </label>
                  <select
                    value={formData.unitType}
                    onChange={(e) => setFormData({ ...formData, unitType: e.target.value as any })}
                    className="w-full rounded-xl border border-slate-300 p-3 text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 bg-white"
                  >
                    <option value="Tablet">Tablet</option>
                    <option value="Capsule">Capsule</option>
                    <option value="Strip">Strip</option>
                    <option value="Blister Pack">Blister Pack</option>
                    <option value="Bottle">Bottle (Syrups/Liquids)</option>
                    <option value="Syrup (100ml)">Syrup (100ml)</option>
                    <option value="Syrup (200ml)">Syrup (200ml)</option>
                    <option value="Box">Box</option>
                    <option value="Tube">Tube (Ointment/Cream)</option>
                    <option value="Sachet">Sachet</option>
                    <option value="Vial">Vial</option>
                    <option value="Ampoule">Ampoule</option>
                    <option value="Roll">Roll (Bandages/Cotton)</option>
                    <option value="Piece">Piece (Devices/Thermometer)</option>
                    <option value="Pack">Pack</option>
                    <option value="Dose">Dose</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-900 mb-1.5">
                    Buying Price ({currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.buyingPrice}
                    onChange={(e) => setFormData({ ...formData, buyingPrice: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-300 p-3 text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-900 mb-1.5">
                    Selling Price ({currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.sellingPrice}
                    onChange={(e) => setFormData({ ...formData, sellingPrice: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-300 p-3 text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-900 mb-1.5">
                    Opening Stock
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.openingStock}
                    onChange={(e) => setFormData({ ...formData, openingStock: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-300 p-3 text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-900 mb-1.5">
                    Current Stock
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.currentStock}
                    onChange={(e) => setFormData({ ...formData, currentStock: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-300 p-3 text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-900 mb-1.5">
                    Min Threshold
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.minStockLevel}
                    onChange={(e) => setFormData({ ...formData, minStockLevel: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-300 p-3 text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 bg-white"
                  />
                </div>
              </div>

            </div>

            {/* Sticky Action Footer */}
            <div className="flex items-center space-x-3 shrink-0 px-5 py-3.5 border-t border-gray-100 bg-gray-50 rounded-b-3xl">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-semibold text-gray-700 hover:bg-white transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 py-2.5 text-sm font-bold text-white shadow-md transition-all cursor-pointer flex items-center justify-center space-x-2"
              >
                <span>{editingProduct ? 'Save Changes' : 'Create Product'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete All Confirmation Modal */}
      {isDeleteAllModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-5 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center space-x-2.5 text-red-600">
                <div className="rounded-full bg-red-100 p-2">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Delete All Products</h3>
              </div>
              <button
                onClick={() => {
                  if (!isDeletingAll) {
                    setIsDeleteAllModalOpen(false);
                    setDeleteAllConfirmText('');
                  }
                }}
                disabled={isDeletingAll}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-2xl bg-red-50 p-4 border border-red-200 text-xs text-red-800 space-y-1">
              <p className="font-bold">Caution: Destructive Action</p>
              <p>
                This will permanently remove <strong>all {products.length} products</strong>, stock counts, and pricing configurations from both the database and local storage. This action cannot be reversed.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-700">
                To confirm, please type <span className="font-mono font-bold text-red-600">DELETE</span> below:
              </label>
              <input
                type="text"
                disabled={isDeletingAll}
                value={deleteAllConfirmText}
                onChange={(e) => setDeleteAllConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="w-full rounded-xl border border-gray-300 p-3 text-sm focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/20"
              />
            </div>

            <div className="pt-2 flex space-x-3">
              <button
                type="button"
                onClick={handleDeleteAllProducts}
                disabled={deleteAllConfirmText.trim().toUpperCase() !== 'DELETE' || isDeletingAll}
                className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed py-3 text-sm font-bold text-white shadow-md transition-all flex items-center justify-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeletingAll ? 'Deleting Products...' : 'Yes, Delete All'}</span>
              </button>
              <button
                type="button"
                disabled={isDeletingAll}
                onClick={() => {
                  setIsDeleteAllModalOpen(false);
                  setDeleteAllConfirmText('');
                }}
                className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Management Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center space-x-2">
                <Layers className="w-5 h-5 text-emerald-600" />
                <h3 className="text-xl font-bold text-gray-900">Manage Categories</h3>
              </div>
              <button
                onClick={() => {
                  setIsCategoryModalOpen(false);
                  setCatError('');
                  setCatSuccess('');
                  setDeletingCatId(null);
                }}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {catSuccess && (
              <div className="flex items-center space-x-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{catSuccess}</span>
              </div>
            )}

            {catError && (
              <div className="flex items-center space-x-2 rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{catError}</span>
              </div>
            )}

            {hasFoodCourtCategories && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl">
                <div className="flex items-center space-x-2 text-amber-900">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-xs font-bold">Legacy Food Court / Bar Categories Detected</p>
                    <p className="text-[11px] text-amber-700">Purge legacy food court categories and restore Alpha Chemist categories</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleBatchDeleteFoodCourtCategories}
                  disabled={isDeletingCat}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-all flex items-center justify-center space-x-1 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Legacy Categories</span>
                </button>
              </div>
            )}

            {/* Add Category Form */}
            <form onSubmit={handleAddCategory} className="space-y-4 bg-gray-50 p-4 rounded-2xl border border-gray-200">
              <h4 className="text-sm font-bold text-gray-800">Add New Category</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">
                    Category Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="e.g. Antibiotics & Anti-Infectives"
                    className="w-full rounded-xl border border-gray-300 p-2.5 text-sm bg-white focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={newCatDesc}
                    onChange={(e) => setNewCatDesc(e.target.value)}
                    placeholder="e.g. Prescription and OTC medications"
                    className="w-full rounded-xl border border-gray-300 p-2.5 text-sm bg-white focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Add Category</span>
              </button>
            </form>

            {/* Existing Categories List */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-gray-800">Existing Categories ({categories.length})</h4>
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-2xl overflow-hidden">
                {categories.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-400">No categories found. Add one above.</div>
                ) : (
                  categories.map(cat => (
                    <div key={cat.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/80 transition-colors">
                      <div>
                        <p className="text-sm font-bold text-gray-900">{cat.name}</p>
                        <p className="text-xs text-gray-500">{cat.description || 'No description'}</p>
                      </div>
                      {deletingCatId === cat.id ? (
                        <div className="flex items-center space-x-2 bg-red-50 p-1.5 rounded-xl border border-red-200 shrink-0">
                          <span className="text-xs font-bold text-red-700 pl-1">Delete category?</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat)}
                            disabled={isDeletingCat}
                            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-xs transition-all flex items-center space-x-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{isDeletingCat ? 'Deleting...' : 'Yes, Delete'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingCatId(null)}
                            disabled={isDeletingCat}
                            className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-700 text-xs font-semibold hover:bg-gray-100 transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setCatError('');
                            setCatSuccess('');
                            setDeletingCatId(cat.id);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-all flex items-center space-x-1.5 shrink-0 font-medium text-xs self-start sm:self-auto"
                          title="Delete Category"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsCategoryModalOpen(false);
                  setCatError('');
                  setCatSuccess('');
                  setDeletingCatId(null);
                }}
                className="rounded-xl bg-gray-900 hover:bg-gray-800 px-5 py-2.5 text-sm font-bold text-white transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Delete Confirmation Modal */}
      {deletingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="p-3 bg-red-50 rounded-2xl">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Delete Product</h3>
                <p className="text-xs text-gray-500">This action will remove the product permanently</p>
              </div>
            </div>

            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 text-sm text-gray-800">
              Are you sure you want to delete <span className="font-bold text-gray-900">"{deletingProduct.name}"</span>?
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                disabled={isDeletingProduct}
                onClick={() => handleConfirmDeleteProduct(deletingProduct)}
                className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 py-2.5 text-sm font-bold text-white transition-all flex items-center justify-center space-x-1.5 shadow-sm"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeletingProduct ? 'Deleting...' : 'Yes, Delete Product'}</span>
              </button>
              <button
                type="button"
                disabled={isDeletingProduct}
                onClick={() => setDeletingProduct(null)}
                className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Label Print Modal */}
      {labelPrintProduct && (
        <BarcodeLabelPrintModal
          isOpen={!!labelPrintProduct}
          product={labelPrintProduct}
          businessConfig={businessConfig}
          onClose={() => setLabelPrintProduct(null)}
          onSwitchToBulkPrint={() => handleOpenBulkPrint()}
        />
      )}

      {/* Bulk Barcode Label Print Modal */}
      <BulkBarcodePrintModal
        isOpen={isBulkPrintModalOpen}
        onClose={() => setIsBulkPrintModalOpen(false)}
        products={products}
        initialSelectedIds={bulkPrintInitialIds}
        categories={categories}
        businessConfig={businessConfig}
      />

      {/* Enlarged Barcode Fullscreen / Zoom Modal */}
      {enlargedBarcodeProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 sm:p-8 shadow-2xl space-y-6 text-center max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2.5 text-left">
                <div className="p-2 rounded-xl bg-slate-900 text-white">
                  <Barcode className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 truncate max-w-xs sm:max-w-sm">
                    {enlargedBarcodeProduct.name}
                  </h3>
                  <p className="text-xs font-semibold text-slate-500">High-Contrast Scanner Display</p>
                </div>
              </div>
              <button
                onClick={() => setEnlargedBarcodeProduct(null)}
                className="rounded-xl p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Giant Barcode Display */}
            <div className="p-6 bg-white rounded-2xl border-4 border-slate-900 shadow-md flex flex-col items-center justify-center">
              <BarcodeDisplay
                value={enlargedBarcodeProduct.barcode}
                width={2.6}
                height={110}
                fontSize={20}
                className="w-full"
              />
              <div className="mt-4 font-mono text-xl sm:text-2xl font-black text-slate-900 tracking-widest bg-slate-100 px-6 py-2 rounded-xl border-2 border-slate-300 select-all">
                {enlargedBarcodeProduct.barcode}
              </div>
              <div className="mt-2 text-xs font-bold text-slate-600 uppercase tracking-wider">
                Format: {detectBarcodeFormat(enlargedBarcodeProduct.barcode)}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(enlargedBarcodeProduct.barcode);
                  setCopiedBarcode(true);
                  setTimeout(() => setCopiedBarcode(false), 2000);
                }}
                className="px-5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold transition-all flex items-center space-x-2 shadow-xs cursor-pointer"
              >
                {copiedBarcode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-600" />}
                <span>{copiedBarcode ? 'Copied to Clipboard!' : 'Copy Barcode'}</span>
              </button>
              <button
                type="button"
                onClick={() => setEnlargedBarcodeProduct(null)}
                className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
