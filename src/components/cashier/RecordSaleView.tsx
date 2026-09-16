import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, BusinessConfig, Product, SaleItem, Sale, PaymentMethod } from '../../types';
import { db, DEFAULT_BUSINESS_ID } from '../../lib/firebase';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { formatCurrency, logAuditAction } from '../../lib/utils';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Banknote,
  Smartphone,
  CircleDollarSign,
  ArrowLeft,
  X,
  Printer,
  Barcode,
  Camera,
  ScanLine,
  Sparkles
} from 'lucide-react';
import { ReceiptModal } from '../common/ReceiptModal';
import { CameraBarcodeScannerModal } from '../common/CameraBarcodeScannerModal';
import { UnknownBarcodeModal } from '../common/UnknownBarcodeModal';
import {
  findProductByBarcode,
  cleanScannedBarcode,
  playScanSuccessSound,
  playScanErrorSound
} from '../../lib/barcodeUtils';
import {
  saveSaleLocallyAndQueue,
  cacheLocalProducts,
  getLocalCachedProducts,
  cacheLocalCategories,
  getLocalCachedCategories,
  syncOfflineQueue
} from '../../lib/offlineManager';

interface RecordSaleViewProps {
  user: UserProfile;
  businessConfig?: BusinessConfig | null;
}

export function RecordSaleView({ user, businessConfig }: RecordSaleViewProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<SaleItem[]>([]);
  
  // Barcode scanning states
  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [unknownBarcode, setUnknownBarcode] = useState('');
  const [showUnknownModal, setShowUnknownModal] = useState(false);
  const [lastScannedItem, setLastScannedItem] = useState<{ product: Product; time: number } | null>(null);

  // Quick Add from Barcode Modal state
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickAddBarcode, setQuickAddBarcode] = useState('');
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddCategoryId, setQuickAddCategoryId] = useState('');
  const [quickAddSellingPrice, setQuickAddSellingPrice] = useState('200');
  const [quickAddBuyingPrice, setQuickAddBuyingPrice] = useState('120');
  const [quickAddOpeningStock, setQuickAddOpeningStock] = useState('50');
  const [quickAddUnitType, setQuickAddUnitType] = useState<Product['unitType']>('Tablet');
  const [quickAddLoading, setQuickAddLoading] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const scannerBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  // Payment states
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [amountTendered, setAmountTendered] = useState<string>('');
  const [referenceCode, setReferenceCode] = useState<string>('');
  const [mobileView, setMobileView] = useState<'catalog' | 'payment'>('catalog');
  
  // Custom item modal state
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customQty, setCustomQty] = useState(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successSale, setSuccessSale] = useState<Sale | null>(null);
  const [orderReceiptSale, setOrderReceiptSale] = useState<Sale | null>(null);
  const [openTabs, setOpenTabs] = useState<Sale[]>([]);
  const [showOpenTabsModal, setShowOpenTabsModal] = useState(false);

  useEffect(() => {
    try {
      const tabs = JSON.parse(localStorage.getItem('bar_pos_open_tabs') || '[]');
      setOpenTabs(tabs);
    } catch (e) {}
  }, []);

  const saveToOpenTabs = (orderSale: Sale) => {
    try {
      const tabs = JSON.parse(localStorage.getItem('bar_pos_open_tabs') || '[]');
      const filtered = tabs.filter((t: Sale) => t.id !== orderSale.id);
      filtered.unshift(orderSale);
      localStorage.setItem('bar_pos_open_tabs', JSON.stringify(filtered));
      setOpenTabs(filtered);
    } catch (e) {}
  };

  const removeOpenTab = (orderId: string) => {
    try {
      const tabs = JSON.parse(localStorage.getItem('bar_pos_open_tabs') || '[]');
      const filtered = tabs.filter((t: Sale) => t.id !== orderId);
      localStorage.setItem('bar_pos_open_tabs', JSON.stringify(filtered));
      setOpenTabs(filtered);
    } catch (e) {}
  };

  const resumeOpenTab = (tab: Sale) => {
    setCart(tab.items);
    removeOpenTab(tab.id);
    setShowOpenTabsModal(false);
  };

  const handlePrintOrderReceipt = () => {
    if (cart.length === 0) {
      setError('Cart is empty. Please select items to print order receipt.');
      return;
    }
    const now = new Date();
    const orderSale: Sale = {
      id: 'order-' + Date.now(),
      items: [...cart],
      totalAmount: totalCartAmount,
      paymentMethod: 'Order Ticket (Unpaid)',
      amountTendered: 0,
      change: 0,
      cashierId: user.uid,
      cashierName: user.name,
      businessDayId: now.toISOString().split('T')[0],
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      createdAt: now.getTime()
    };
    saveToOpenTabs(orderSale);
    setOrderReceiptSale(orderSale);
  };

  useEffect(() => {
    fetchProductsAndCategories();
  }, []);

  async function fetchProductsAndCategories() {
    // 1. Instant load from offline cache
    const cachedProds = getLocalCachedProducts();
    if (cachedProds.length > 0) {
      setProducts(cachedProds);
    }
    const cachedCats = getLocalCachedCategories();
    if (cachedCats.length > 0) {
      setCategories(cachedCats);
    }

    // 2. Only fetch fresh from Firestore if actively online
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }

    const isNonChemistItem = (text: string) => {
      const t = text.toLowerCase();
      const banned = [
        'room', 'hotel', 'beer', 'tusker', 'white cap', 'guinness', 'heineken',
        'smirnoff', 'vodka', 'whiskey', 'cocktail', 'tilapia', 'pilau', 'burger',
        'spa', 'massage', 'food court'
      ];
      return banned.some(w => t.includes(w));
    };

    try {
      const prodRef = collection(db, 'businesses', DEFAULT_BUSINESS_ID, 'products');
      const prodSnap = await getDocs(prodRef);
      const prods: Product[] = [];
      prodSnap.forEach(d => {
        const data = d.data();
        const text = (data.name || '') + ' ' + (data.categoryName || '') + ' ' + d.id;
        if (!isNonChemistItem(text)) {
          prods.push({ id: d.id, ...data } as Product);
        }
      });
      if (prods.length > 0) {
        setProducts(prods);
        cacheLocalProducts(prods);
      } else {
        const cached = getLocalCachedProducts();
        setProducts(cached);
      }

      const catRef = collection(db, 'businesses', DEFAULT_BUSINESS_ID, 'categories');
      const catSnap = await getDocs(catRef);
      const cats: { id: string; name: string }[] = [];
      catSnap.forEach(d => {
        const data = d.data();
        const text = (data.name || '') + ' ' + (data.description || '') + ' ' + d.id;
        if (!isNonChemistItem(text)) {
          cats.push({ id: d.id, name: data.name });
        }
      });
      if (cats.length > 0) {
        setCategories(cats);
        cacheLocalCategories(cats);
      } else {
        const cachedC = getLocalCachedCategories();
        setCategories(cachedC);
      }
    } catch (err) {
      console.warn("Using local cached catalog:", err);
      const cached = getLocalCachedProducts();
      setProducts(cached);
      const cachedC = getLocalCachedCategories();
      setCategories(cachedC);
    }
  }

  const addToCart = (product: Product, delta: number = 1) => {
    setError('');
    const existingIndex = cart.findIndex(item => item.productId === product.id);
    const currentQtyInCart = existingIndex >= 0 ? cart[existingIndex].quantity : 0;
    const requestedQty = currentQtyInCart + delta;

    if (delta > 0 && requestedQty > product.currentStock && !businessConfig?.allowNegativeStock) {
      setError(`Cannot add "${product.name}": Available stock is only ${product.currentStock} ${product.unitType || 'item'}(s). Enable "Allow Negative Stock" in Settings if you wish to oversell.`);
      playScanErrorSound();
      return;
    }

    if (requestedQty <= 0) {
      if (existingIndex >= 0) {
        const newCart = [...cart];
        newCart.splice(existingIndex, 1);
        setCart(newCart);
      }
      return;
    }

    if (existingIndex >= 0) {
      const newCart = [...cart];
      newCart[existingIndex].quantity = requestedQty;
      newCart[existingIndex].totalAmount = requestedQty * product.sellingPrice;
      setCart(newCart);
    } else {
      setCart([
        ...cart,
        {
          productId: product.id,
          productName: product.name,
          barcode: product.barcode,
          quantity: 1,
          unitPrice: product.sellingPrice,
          totalAmount: product.sellingPrice
        }
      ]);
    }
  };

  const updateCartQty = (productId: string, newQty: number) => {
    setError('');
    const product = products.find(p => p.id === productId);
    if (product && newQty > product.currentStock && !businessConfig?.allowNegativeStock) {
      setError(`Cannot increase quantity for "${product.name}": Only ${product.currentStock} available in stock.`);
      playScanErrorSound();
      return;
    }

    if (newQty <= 0) {
      setCart(cart.filter(item => item.productId !== productId));
      return;
    }

    setCart(cart.map(item => {
      if (item.productId === productId) {
        return {
          ...item,
          quantity: newQty,
          totalAmount: newQty * item.unitPrice
        };
      }
      return item;
    }));
  };

  const handleBarcodeScanned = (rawCode: string) => {
    if (!rawCode || !rawCode.trim()) return;
    const sanitized = cleanScannedBarcode(rawCode) || rawCode.trim();

    // Search products in current business/tenant
    const matchedProduct = findProductByBarcode(products, rawCode);

    if (matchedProduct) {
      if (matchedProduct.status === 'inactive') {
        setError(`Product "${matchedProduct.name}" is inactive and cannot be sold.`);
        playScanErrorSound();
        setBarcodeQuery('');
        return;
      }

      // Check available stock
      const existingInCart = cart.find(i => i.productId === matchedProduct.id);
      const currentQty = existingInCart ? existingInCart.quantity : 0;
      const nextQty = currentQty + 1;

      if (nextQty > matchedProduct.currentStock && !businessConfig?.allowNegativeStock) {
        setError(`Cannot scan "${matchedProduct.name}": Available stock is only ${matchedProduct.currentStock} ${matchedProduct.unitType || 'item'}(s).`);
        playScanErrorSound();
        setBarcodeQuery('');
        return;
      }

      addToCart(matchedProduct, 1);
      playScanSuccessSound();
      setLastScannedItem({ product: matchedProduct, time: Date.now() });
      setBarcodeQuery('');
      setError('');

      // Auto-refocus scanner input for rapid continuous scanning
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 50);
    } else {
      playScanErrorSound();
      setUnknownBarcode(sanitized);
      setShowUnknownModal(true);
      setBarcodeQuery('');
    }
  };

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (barcodeQuery.trim()) {
        handleBarcodeScanned(barcodeQuery.trim());
      }
    }
  };

  // Automatically focus the barcode input when POS opens or mobile view toggles
  useEffect(() => {
    const timer = setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, [mobileView]);

  // Global keyboard wedge listener for USB and Bluetooth barcode scanners + shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // F2 hotkey: Focus barcode scanner input
      if (e.key === 'F2') {
        e.preventDefault();
        barcodeInputRef.current?.focus();
        barcodeInputRef.current?.select();
        return;
      }

      // F4 hotkey: Go to payment / cart
      if (e.key === 'F4') {
        e.preventDefault();
        if (cart.length > 0) {
          setMobileView('payment');
        }
        return;
      }

      // Escape key: Close modals
      if (e.key === 'Escape') {
        if (isCameraScannerOpen) setIsCameraScannerOpen(false);
        if (showUnknownModal) setShowUnknownModal(false);
        if (showQuickAddModal) setShowQuickAddModal(false);
        if (showCustomModal) setShowCustomModal(false);
        if (showOpenTabsModal) setShowOpenTabsModal(false);
        return;
      }

      // If user is currently focused inside a standard text input (except barcode input), do not intercept
      const activeEl = document.activeElement;
      const isOtherInput =
        activeEl &&
        (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT') &&
        activeEl !== barcodeInputRef.current;

      if (isOtherInput) return;
      if (activeEl === barcodeInputRef.current) return;

      // Handle barcode scanner keyboard wedge input (rapid character buffer terminated by Enter)
      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        if (scannerBufferRef.current.trim().length >= 3) {
          e.preventDefault();
          const scannedCode = scannerBufferRef.current.trim();
          scannerBufferRef.current = '';
          handleBarcodeScanned(scannedCode);
        } else {
          scannerBufferRef.current = '';
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (timeDiff > 150) {
          scannerBufferRef.current = e.key;
        } else {
          scannerBufferRef.current += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [cart, isCameraScannerOpen, showUnknownModal, showQuickAddModal, showCustomModal, showOpenTabsModal, products, businessConfig]);

  const openQuickAddProductModal = (barcode: string) => {
    setQuickAddBarcode(barcode);
    setQuickAddName('');
    setQuickAddCategoryId(categories[0]?.id || 'cat-antibiotics');
    setQuickAddSellingPrice('200');
    setQuickAddBuyingPrice('120');
    setQuickAddOpeningStock('50');
    setQuickAddUnitType('Tablet');
    setShowQuickAddModal(true);
  };

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddName.trim()) {
      setError('Product name is required');
      return;
    }
    const sellPrice = parseFloat(quickAddSellingPrice);
    if (isNaN(sellPrice) || sellPrice <= 0) {
      setError('Selling price must be greater than 0');
      return;
    }

    setQuickAddLoading(true);
    try {
      const now = new Date().toISOString();
      const productId = 'prod-' + Date.now();
      const cat = categories.find(c => c.id === quickAddCategoryId);
      const categoryName = cat ? cat.name : 'Antibiotics & Anti-Infectives';
      const stock = parseInt(quickAddOpeningStock) || 50;

      const newProd: Product = {
        id: productId,
        name: quickAddName.trim(),
        barcode: quickAddBarcode.trim(),
        categoryId: quickAddCategoryId || categories[0]?.id || 'cat-antibiotics',
        categoryName,
        unitType: quickAddUnitType,
        buyingPrice: parseFloat(quickAddBuyingPrice) || 0,
        sellingPrice: sellPrice,
        openingStock: stock,
        currentStock: stock,
        stockAdded: 0,
        minStockLevel: 10,
        status: 'active',
        createdAt: now,
        updatedAt: now
      };

      try {
        await setDoc(doc(db, 'businesses', DEFAULT_BUSINESS_ID, 'products', productId), newProd);
      } catch (err) {
        console.warn('Firestore fallback on quick add:', err);
      }

      const updatedProds = [newProd, ...products];
      setProducts(updatedProds);
      cacheLocalProducts(updatedProds);
      localStorage.setItem('bar_pos_local_products', JSON.stringify(updatedProds));

      // Automatically add newly registered product to cart!
      addToCart(newProd, 1);
      playScanSuccessSound();
      setLastScannedItem({ product: newProd, time: Date.now() });

      setShowQuickAddModal(false);
      setBarcodeQuery('');
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to save product');
    } finally {
      setQuickAddLoading(false);
    }
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const handleAddCustomItem = (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseFloat(customPrice);
    if (!customName.trim() || isNaN(price) || price <= 0) {
      setError('Please provide a valid item name and price.');
      return;
    }

    const qty = customQty > 0 ? customQty : 1;
    const customItem: SaleItem = {
      productId: 'custom-' + Date.now(),
      productName: customName.trim(),
      quantity: qty,
      unitPrice: price,
      totalAmount: qty * price
    };

    setCart([...cart, customItem]);
    setShowCustomModal(false);
    setCustomName('');
    setCustomPrice('');
    setCustomQty(1);
    setError('');
  };

  const totalCartAmount = cart.reduce((sum, item) => sum + item.totalAmount, 0);

  // Auto-fill tendered amount with exact cart total if empty or less than total
  useEffect(() => {
    if (!amountTendered || parseFloat(amountTendered) < totalCartAmount) {
      if (totalCartAmount > 0) {
        setAmountTendered(totalCartAmount.toString());
      }
    }
  }, [totalCartAmount]);

  const handleRecordSale = () => {
    if (cart.length === 0) {
      setError('Cart is empty. Please select products to record sale.');
      return;
    }

    // Strict validation: amount received/tendered cannot be less than total bill amount
    const tenderedNum = amountTendered ? parseFloat(amountTendered) : 0;
    if (isNaN(tenderedNum) || tenderedNum < totalCartAmount) {
      setError(`Amount received (${formatCurrency(tenderedNum, currency)}) is less than total bill (${formatCurrency(totalCartAmount, currency)}). Please collect full payment of at least ${formatCurrency(totalCartAmount, currency)}.`);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const now = new Date();
      const saleId = 'sale-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
      const parsedTendered = amountTendered ? parseFloat(amountTendered) : totalCartAmount;
      const changeDue = Math.max(0, parsedTendered - totalCartAmount);

      const completedSale: Sale = {
        id: saleId,
        items: [...cart],
        totalAmount: totalCartAmount,
        paymentMethod,
        amountTendered: parsedTendered,
        change: changeDue,
        referenceCode: referenceCode.trim() || undefined,
        cashierId: user.uid,
        cashierName: user.name,
        businessDayId: todayStr,
        date: todayStr,
        time: now.toTimeString().split(' ')[0],
        createdAt: now.getTime()
      };

      // 1. Instantly persist locally & queue for sync (ensures 100% offline-first reliability)
      saveSaleLocallyAndQueue(completedSale);

      // 2. Immediately update in-memory products state with deducted stock so UI reflects sold units
      const updatedLocalProds = getLocalCachedProducts();
      if (updatedLocalProds.length > 0) {
        setProducts(updatedLocalProds);
      }

      // 3. Immediately display receipt modal & reset cart - zero delay for customer!
      setSuccessSale(completedSale);
      setCart([]);
      setAmountTendered('');
      setReferenceCode('');
      setMobileView('catalog');

      // 4. Background non-blocking audit log & Firestore sync if online
      logAuditAction(
        user.uid,
        user.name,
        'SALE_RECORDED',
        `Recorded sale of ${formatCurrency(totalCartAmount, currency)} via ${paymentMethod} (${cart.length} items)`,
        saleId
      ).catch(() => {});

      if (typeof navigator !== 'undefined' && navigator.onLine) {
        syncOfflineQueue().catch((syncErr) => {
          console.warn('Background sync deferred:', syncErr);
        });
      }
    } catch (err: any) {
      console.error("Sale recording failed:", err);
      setError(err.message || 'Failed to complete transaction.');
    } finally {
      setLoading(false);
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
                          (p.dosage && p.dosage.toLowerCase().includes(query)) ||
                          (p.barcode && (p.barcode.toLowerCase().includes(query) || (cleanQ && p.barcode.toLowerCase().includes(cleanQ))));
    return matchesCat && matchesSearch;
  });

  const currency = businessConfig?.currency || 'KSh';
  const cartItemCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const parsedTendered = amountTendered ? parseFloat(amountTendered) : 0;
  const changeDue = Math.max(0, parsedTendered - totalCartAmount);
  const balanceRemaining = Math.max(0, totalCartAmount - parsedTendered);

  return (
    <div className="space-y-4 pb-28 lg:pb-6">
      {/* Mobile Top Segment Switcher (Catalog vs Cart & Payment) */}
      <div className="lg:hidden flex rounded-2xl bg-slate-900 p-1.5 shadow-md sticky top-16 z-30">
        <button
          onClick={() => setMobileView('catalog')}
          className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl flex items-center justify-center space-x-2 transition-all ${
            mobileView === 'catalog'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <span>📋 Catalog ({filteredProducts.length})</span>
        </button>
        <button
          onClick={() => setMobileView('payment')}
          className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl flex items-center justify-center space-x-1.5 transition-all ${
            mobileView === 'payment'
              ? 'bg-emerald-500 text-slate-950 shadow-md ring-2 ring-emerald-400'
              : 'text-emerald-300 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30'
          }`}
        >
          <CreditCard className="w-4 h-4 text-emerald-300 shrink-0" />
          <span>Payment & Cart</span>
          <span className="ml-1 bg-emerald-600 text-white text-[10px] px-2 py-0.5 rounded-full font-black">
            {cartItemCount} | {formatCurrency(totalCartAmount, currency)}
          </span>
        </button>
      </div>

      {/* Prominent Barcode Scanner Bar at the Top of POS */}
      <div className="rounded-3xl bg-slate-900 p-4 text-white shadow-lg border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <Barcode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-white tracking-wide">POS Barcode Scanner</h3>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                  ● Scanner Ready (USB / Bluetooth / Camera)
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Scan with any handheld scanner or press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] border border-slate-700">F2</kbd> to focus
              </p>
            </div>
          </div>

          {lastScannedItem && Date.now() - lastScannedItem.time < 8000 && (
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-600/50 text-emerald-300 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="truncate max-w-[200px]">
                Added: <strong>{lastScannedItem.product.name}</strong>
              </span>
              <span className="text-emerald-400 font-mono font-bold">
                {formatCurrency(lastScannedItem.product.sellingPrice, currency)}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-emerald-400">
              <ScanLine className="w-5 h-5" />
            </div>
            <input
              ref={barcodeInputRef}
              type="text"
              value={barcodeQuery}
              onChange={(e) => setBarcodeQuery(e.target.value)}
              onKeyDown={handleBarcodeKeyDown}
              placeholder="Scan barcode with scanner or type code and press Enter..."
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/90 py-3.5 pl-11 pr-24 font-mono text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
            />
            {barcodeQuery && (
              <button
                type="button"
                onClick={() => {
                  setBarcodeQuery('');
                  barcodeInputRef.current?.focus();
                }}
                className="absolute inset-y-0 right-14 pr-2 flex items-center text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (barcodeQuery.trim()) {
                  handleBarcodeScanned(barcodeQuery.trim());
                }
              }}
              className="absolute inset-y-1.5 right-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all flex items-center space-x-1 cursor-pointer"
            >
              <span>Add</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsCameraScannerOpen(true)}
            className="px-4 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-bold transition-all flex items-center justify-center space-x-2 shrink-0 cursor-pointer shadow-sm active:scale-95"
            title="Open camera scanner for mobile/tablet/webcam"
          >
            <Camera className="w-4 h-4 text-emerald-400" />
            <span>Camera Scanner</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Product Catalog & Search (Visible on desktop or when mobileView === 'catalog') */}
        <div className={`lg:col-span-7 space-y-4 ${mobileView === 'payment' ? 'hidden lg:block' : 'block'}`}>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search medicines, pharmaceutical products, or barcode..."
                className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-11 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 shadow-xs"
              />
            </div>

            {/* Open Tabs Button */}
            <button
              type="button"
              onClick={() => setShowOpenTabsModal(true)}
              className="px-4 py-3 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 whitespace-nowrap transition-all flex items-center space-x-2 shadow-xs cursor-pointer"
            >
              <span>📂 Open Tabs</span>
              <span className="bg-emerald-600 text-white px-2 py-0.5 rounded-full text-[11px] font-black">{openTabs.length}</span>
            </button>

            <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none items-center">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedCategory === 'all'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                All Items
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
              <button
                onClick={() => setShowCustomModal(true)}
                className="px-3 py-2.5 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 whitespace-nowrap transition-all flex items-center space-x-1"
                title="Add custom item not in catalog"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Custom</span>
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center space-x-3 rounded-xl bg-red-50 p-4 text-sm text-red-700 border border-red-200">
              <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Product Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 max-h-[calc(100vh-230px)] overflow-y-auto pr-1">
            {filteredProducts.map(product => {
              const inCart = cart.find(i => i.productId === product.id);
              const isOutOfStock = product.currentStock <= 0;

              return (
                <div
                  key={product.id}
                  className={`rounded-2xl border p-4 bg-white shadow-xs flex flex-col justify-between transition-all ${
                    isOutOfStock ? 'border-emerald-200/80 bg-emerald-50/10' : 'border-gray-200 hover:border-emerald-500 hover:shadow-md'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600">
                            {product.categoryName}
                          </span>
                          {product.prescriptionRequired && (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-red-100 text-red-800 border border-red-200">
                              Rx
                            </span>
                          )}
                          {product.barcode && (
                            <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              <Barcode className="w-3 h-3 text-slate-500" />
                              <span>{product.barcode}</span>
                            </span>
                          )}
                        </div>
                        <h4 className="font-bold text-gray-900 text-base">{product.name}</h4>
                        {product.genericName && (
                          <p className="text-xs text-slate-500 font-medium italic mt-0.5">
                            {product.genericName}{product.dosage ? ` • ${product.dosage}` : ''}
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-extrabold text-emerald-700">
                        {formatCurrency(product.sellingPrice, currency)}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className={`font-semibold ${isOutOfStock ? 'text-emerald-700' : product.currentStock <= product.minStockLevel ? 'text-emerald-600' : 'text-emerald-600'}`}>
                        Available: {product.currentStock} {product.unitType}s
                        {isOutOfStock && <span className="ml-1 text-[10px] text-emerald-600 font-normal">(Tap to sell)</span>}
                      </span>
                      {inCart && (
                        <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                          In Cart: {inCart.quantity}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => addToCart(product, -1)}
                        disabled={!inCart}
                        className="w-9 h-9 rounded-xl border border-gray-300 flex items-center justify-center text-gray-700 hover:bg-gray-100 disabled:opacity-30 active:scale-95 transition-all font-bold"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center font-bold text-sm text-gray-900">
                        {inCart ? inCart.quantity : 0}
                      </span>
                      <button
                        onClick={() => addToCart(product, 1)}
                        className="w-9 h-9 rounded-xl border border-gray-300 flex items-center justify-center text-gray-700 hover:bg-gray-100 active:scale-95 transition-all font-bold"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      onClick={() => addToCart(product, 1)}
                      className="rounded-xl bg-slate-900 hover:bg-emerald-600 text-white px-4 py-2 text-xs font-bold shadow-xs active:scale-95 transition-all"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Cart AND Prominent "WHERE TO PUT PAYMENT" (Visible on desktop or when mobileView === 'payment') */}
        <div className={`lg:col-span-5 bg-white rounded-3xl p-5 sm:p-6 shadow-md border border-gray-200 flex flex-col justify-between space-y-4 ${mobileView === 'catalog' ? 'hidden lg:flex' : 'flex'}`}>
          <div>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center space-x-2">
                {mobileView === 'payment' && (
                  <button
                    onClick={() => setMobileView('catalog')}
                    className="lg:hidden p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-all flex items-center"
                    title="Back to Catalog"
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    <span className="text-xs font-bold">Catalog</span>
                  </button>
                )}
                <h3 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
                  <ShoppingCart className="w-5 h-5 text-emerald-600" />
                  <span>Current Cart</span>
                </h3>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowCustomModal(true)}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-xl border border-emerald-200 transition-all flex items-center space-x-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Custom Item</span>
                </button>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900">
                  {cartItemCount} items
                </span>
              </div>
            </div>

            {/* Cart Items List */}
            <div className="my-3 max-h-52 overflow-y-auto space-y-2 pr-1">
              {cart.length === 0 ? (
                <div className="text-center py-6 text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                  <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-30 text-gray-400" />
                  <p className="text-xs font-bold text-gray-600">Cart is empty</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Select medicines from the catalog, scan barcodes, or add an item</p>
                  <button
                    onClick={() => setMobileView('catalog')}
                    className="lg:hidden mt-2 text-xs font-bold text-emerald-600 underline"
                  >
                    Open Pharmacy Catalog
                  </button>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.productId} className="flex items-center justify-between p-2.5 rounded-2xl bg-gray-50 border border-gray-100">
                    <div className="flex-1 pr-2">
                      <h5 className="font-semibold text-gray-900 text-xs sm:text-sm">{item.productName}</h5>
                      <div className="flex items-center space-x-2">
                        <p className="text-[11px] text-gray-500">{formatCurrency(item.unitPrice, currency)} each</p>
                        {item.barcode && (
                          <span className="text-[10px] font-mono text-slate-600 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                            {item.barcode}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <div className="flex items-center space-x-1 border border-gray-300 rounded-lg bg-white px-1 py-0.5">
                        <button
                          onClick={() => updateCartQty(item.productId, item.quantity - 1)}
                          className="p-1 text-gray-600 hover:text-red-600"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateCartQty(item.productId, parseInt(e.target.value) || 0)}
                          className="w-8 text-center font-bold text-xs focus:outline-none"
                        />
                        <button
                          onClick={() => updateCartQty(item.productId, item.quantity + 1)}
                          className="p-1 text-gray-600 hover:text-emerald-600"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <span className="font-extrabold text-xs sm:text-sm text-gray-900 w-16 text-right">
                        {formatCurrency(item.totalAmount, currency)}
                      </span>

                      <button
                        onClick={() => removeFromCart(item.productId)}
                        className="p-1 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ================= PAYMENT SECTION (WHERE TO PUT PAYMENT) ================= */}
          <div className="border-t-2 border-emerald-300 bg-slate-900 text-white -mx-5 -mb-5 sm:-mx-6 sm:-mb-6 p-4 sm:p-5 rounded-b-3xl space-y-4 shadow-inner">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 font-black">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400">
                    Where to Put Payment
                  </h4>
                  <p className="text-[11px] text-slate-400">Select payment method & enter amount</p>
                </div>
              </div>
              <span className="text-xs font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded-full">
                Step 2
              </span>
            </div>

            {/* Total Bill Card */}
            <div className="bg-slate-800 border border-slate-700 p-3 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Total Bill to Collect</p>
                <p className="text-2xl font-black text-emerald-400">{formatCurrency(totalCartAmount, currency)}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-slate-300">{cartItemCount} item{cartItemCount === 1 ? '' : 's'}</p>
                <p className="text-[10px] text-emerald-400 font-semibold">Ready for Tender</p>
              </div>
            </div>

            {/* 1. Payment Method Buttons */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                1. Select Payment Method:
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: 'Cash', label: 'Cash', icon: Banknote },
                  { id: 'M-Pesa', label: 'M-Pesa', icon: Smartphone },
                  { id: 'Card', label: 'Card', icon: CreditCard },
                  { id: 'Other', label: 'Other', icon: CircleDollarSign }
                ].map(m => {
                  const Icon = m.icon;
                  const isSelected = paymentMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setPaymentMethod(m.id as PaymentMethod);
                        if (m.id === 'Cash' && (!amountTendered || amountTendered === '0')) {
                          setAmountTendered(totalCartAmount > 0 ? totalCartAmount.toString() : '');
                        }
                      }}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs font-bold transition-all ${
                        isSelected
                          ? 'bg-emerald-500 border-emerald-400 text-slate-950 shadow-md ring-2 ring-emerald-300/40 scale-102'
                          : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      <Icon className="w-4 h-4 mb-0.5" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Amount Tendered / Received Input (Always available to record money paid) */}
            <div className="bg-slate-800/90 border border-slate-700 p-3 rounded-2xl space-y-2.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-emerald-300">
                    2. Enter Amount Received / Tendered:
                  </label>
                  <span className="text-[10px] text-slate-400">Record customer money paid</span>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center font-bold text-emerald-400 text-sm">
                    {currency}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={amountTendered}
                    onChange={(e) => setAmountTendered(e.target.value)}
                    placeholder={totalCartAmount > 0 ? totalCartAmount.toString() : '0.00'}
                    className="w-full pl-13 pr-14 py-2.5 rounded-xl border-2 border-emerald-500 bg-slate-900 text-xl font-black text-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                  {amountTendered && (
                    <button
                      type="button"
                      onClick={() => setAmountTendered('')}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs font-bold text-slate-400 hover:text-slate-200"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Cash Presets */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setAmountTendered(totalCartAmount.toString())}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-emerald-600 text-white border border-slate-600"
                >
                  Exact ({formatCurrency(totalCartAmount, currency)})
                </button>
                {[500, 1000, 2000].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAmountTendered(val.toString())}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-emerald-600 text-white border border-slate-600"
                  >
                    {val}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const current = parseFloat(amountTendered) || 0;
                    setAmountTendered((current + 100).toString());
                  }}
                  className="text-[11px] font-bold px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border border-emerald-500/40"
                >
                  +100
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const current = parseFloat(amountTendered) || 0;
                    setAmountTendered((current + 500).toString());
                  }}
                  className="text-[11px] font-bold px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border border-emerald-500/40"
                >
                  +500
                </button>
              </div>

              {/* Live Change Calculation */}
              {amountTendered && parsedTendered >= totalCartAmount && (
                <div className="p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-500/60 flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-300 uppercase tracking-wide">
                    Change to Return:
                  </span>
                  <span className="text-lg font-black text-emerald-400">
                    {formatCurrency(changeDue, currency)}
                  </span>
                </div>
              )}

              {amountTendered && parsedTendered > 0 && parsedTendered < totalCartAmount && (
                <div className="p-2.5 rounded-xl bg-red-950/80 border border-red-500/60 flex items-center justify-between">
                  <span className="text-xs font-bold text-red-300 uppercase tracking-wide">
                    Balance Remaining:
                  </span>
                  <span className="text-base font-black text-red-400">
                    {formatCurrency(balanceRemaining, currency)}
                  </span>
                </div>
              )}
            </div>

            {paymentMethod === 'M-Pesa' && (
              <div className="bg-slate-800/90 border border-slate-700 p-3 rounded-2xl space-y-2">
                <label className="block text-xs font-bold text-emerald-300">
                  2. Enter M-Pesa Confirmation Code or Customer Phone:
                </label>
                <input
                  type="text"
                  value={referenceCode}
                  onChange={(e) => setReferenceCode(e.target.value)}
                  placeholder="e.g. QBC91823 or 0712345678"
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-emerald-500 bg-slate-900 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <p className="text-[10px] text-slate-400">
                  Customer confirms M-Pesa payment to your till/paybill.
                </p>
              </div>
            )}

            {(paymentMethod === 'Card' || paymentMethod === 'Other') && (
              <div className="bg-slate-800/90 border border-slate-700 p-3 rounded-2xl space-y-2">
                <label className="block text-xs font-bold text-emerald-300">
                  2. Reference / Slip Code (Optional):
                </label>
                <input
                  type="text"
                  value={referenceCode}
                  onChange={(e) => setReferenceCode(e.target.value)}
                  placeholder="e.g. POS Slip Approval #4892"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-600 bg-slate-900 text-sm font-semibold text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            )}

            {/* Print Order Receipt (KOT) Button */}
            <button
              type="button"
              onClick={handlePrintOrderReceipt}
              disabled={cart.length === 0}
              className="w-full rounded-2xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 py-3 text-xs sm:text-sm font-bold transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-4 h-4 text-emerald-400" />
              <span>PRINT ORDER RECEIPT (KOT)</span>
            </button>

            {/* Complete Payment Button */}
            <button
              onClick={handleRecordSale}
              disabled={loading || cart.length === 0}
              className="w-full rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] py-3.5 text-sm sm:text-base font-black text-slate-950 shadow-xl shadow-emerald-500/20 transition-all disabled:opacity-50 uppercase tracking-wide flex items-center justify-center space-x-2 cursor-pointer"
            >
              <CheckCircle2 className="w-5 h-5 text-slate-950" />
              <span>
                {loading ? 'Processing Transaction...' : `COMPLETE PAYMENT (${formatCurrency(totalCartAmount, currency)})`}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Floating Bottom Sticky Bar for Mobile (Always visible on mobile to jump directly to Payment) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 p-3 px-4 flex items-center justify-between shadow-2xl">
        <div>
          <p className="text-[11px] text-slate-400 font-medium">
            {cartItemCount} item{cartItemCount === 1 ? '' : 's'} in cart
          </p>
          <p className="text-lg font-black text-emerald-400">
            {formatCurrency(totalCartAmount, currency)}
          </p>
        </div>
        <button
          onClick={() => setMobileView(mobileView === 'catalog' ? 'payment' : 'catalog')}
          className="flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-black px-4 py-2.5 rounded-xl shadow-lg transition-all text-xs sm:text-sm uppercase tracking-wide"
        >
          <CreditCard className="w-4 h-4" />
          <span>{mobileView === 'catalog' ? 'PUT PAYMENT ➔' : 'BACK TO CATALOG'}</span>
        </button>
      </div>

      {/* Custom Item Modal */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h4 className="text-base font-bold text-gray-900">Add Custom Drink / Item</h4>
              <button
                onClick={() => setShowCustomModal(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomItem} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Item Description</label>
                <input
                  type="text"
                  required
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Cocktail, Special Shot, Snack"
                  className="w-full rounded-xl border border-gray-300 p-2.5 text-sm focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Price ({currency})</label>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    required
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    placeholder="250"
                    className="w-full rounded-xl border border-gray-300 p-2.5 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={customQty}
                    onChange={(e) => setCustomQty(parseInt(e.target.value) || 1)}
                    className="w-full rounded-xl border border-gray-300 p-2.5 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex space-x-2">
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 text-xs font-bold text-white shadow-md transition-all uppercase"
                >
                  Add to Cart
                </button>
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  className="flex-1 rounded-xl border border-gray-300 py-3 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success Receipt Modal */}
      {successSale && (
        <ReceiptModal
          sale={successSale}
          businessConfig={businessConfig}
          onClose={() => setSuccessSale(null)}
        />
      )}

      {/* Order Receipt / KOT Modal */}
      {orderReceiptSale && (
        <ReceiptModal
          sale={orderReceiptSale}
          businessConfig={businessConfig}
          onClose={() => setOrderReceiptSale(null)}
        />
      )}

      {/* Open Unpaid Order Tabs Modal */}
      {showOpenTabsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl space-y-4 text-slate-900 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                <span>📂 Open Unpaid Order Tabs ({openTabs.length})</span>
              </h3>
              <button onClick={() => setShowOpenTabsModal(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-600">Unpaid orders that were printed or saved. Click Resume to load them back into the active cart.</p>
            {openTabs.length === 0 ? (
              <div className="text-center py-10 text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                <p className="text-sm font-semibold">No open unpaid tabs</p>
                <p className="text-xs text-gray-400 mt-1">Printed order receipts and saved unpaid tabs will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {openTabs.map(tab => (
                  <div key={tab.id} className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-extrabold text-gray-900 text-sm">#{tab.id.slice(-6).toUpperCase()}</span>
                        <span className="text-[10px] bg-emerald-200 text-emerald-900 font-bold px-2 py-0.5 rounded-full">{tab.date} {tab.time}</span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1 font-medium">
                        {tab.items.length} item{tab.items.length === 1 ? '' : 's'} ({tab.items.map(i => `${i.quantity}x ${i.productName}`).join(', ')})
                      </p>
                      <p className="text-xs font-bold text-emerald-800 mt-1">Total: {formatCurrency(tab.totalAmount, currency)}</p>
                    </div>
                    <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                      <button
                        type="button"
                        onClick={() => resumeOpenTab(tab)}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
                      >
                        Resume Order ➔
                      </button>
                      <button
                        type="button"
                        onClick={() => removeOpenTab(tab.id)}
                        className="px-3 py-2 rounded-xl bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold transition-all cursor-pointer"
                        title="Delete Tab"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowOpenTabsModal(false)}
              className="w-full py-3 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
      {/* Camera Barcode Scanner Modal */}
      <CameraBarcodeScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => {
          setIsCameraScannerOpen(false);
          setTimeout(() => barcodeInputRef.current?.focus(), 50);
        }}
        onScan={(scannedCode) => {
          setIsCameraScannerOpen(false);
          handleBarcodeScanned(scannedCode);
        }}
      />

      {/* Unknown Barcode Modal */}
      <UnknownBarcodeModal
        isOpen={showUnknownModal}
        scannedBarcode={unknownBarcode}
        onClose={() => {
          setShowUnknownModal(false);
          setTimeout(() => barcodeInputRef.current?.focus(), 50);
        }}
        onAddNewProduct={(barcode) => {
          setShowUnknownModal(false);
          openQuickAddProductModal(barcode);
        }}
        onSearchManual={() => {
          setShowUnknownModal(false);
          setSearchQuery(unknownBarcode);
        }}
      />

      {/* Quick Add Product from Barcode Modal */}
      {showQuickAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Add Scanned Product</h3>
                  <p className="text-xs text-gray-500">Save to inventory & add to cart immediately</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickAddModal(false)}
                className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQuickAddSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">
                  Barcode Value
                </label>
                <input
                  type="text"
                  readOnly
                  value={quickAddBarcode}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 font-mono text-xs font-bold text-slate-700 select-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={quickAddName}
                  onChange={(e) => setQuickAddName(e.target.value)}
                  placeholder="e.g. Red Bull Energy Drink 250ml"
                  className="w-full rounded-xl border border-gray-300 p-2.5 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">
                    Category
                  </label>
                  <select
                    value={quickAddCategoryId}
                    onChange={(e) => setQuickAddCategoryId(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 p-2.5 text-sm bg-white focus:border-emerald-600 focus:outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">
                    Unit Type
                  </label>
                  <select
                    value={quickAddUnitType}
                    onChange={(e) => setQuickAddUnitType(e.target.value as any)}
                    className="w-full rounded-xl border border-gray-300 p-2.5 text-sm bg-white focus:border-emerald-600 focus:outline-none"
                  >
                    <option value="Tablet">Tablet</option>
                    <option value="Capsule">Capsule</option>
                    <option value="Strip">Strip</option>
                    <option value="Blister Pack">Blister Pack</option>
                    <option value="Bottle">Bottle (Syrups/Liquid)</option>
                    <option value="Syrup (100ml)">Syrup (100ml)</option>
                    <option value="Syrup (200ml)">Syrup (200ml)</option>
                    <option value="Box">Box</option>
                    <option value="Tube">Tube (Ointment/Cream)</option>
                    <option value="Sachet">Sachet</option>
                    <option value="Vial">Vial</option>
                    <option value="Ampoule">Ampoule</option>
                    <option value="Roll">Roll (Bandages/Cotton)</option>
                    <option value="Piece">Piece (Devices)</option>
                    <option value="Pack">Pack</option>
                    <option value="Dose">Dose</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">
                    Selling Price ({currency}) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={quickAddSellingPrice}
                    onChange={(e) => setQuickAddSellingPrice(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 p-2.5 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">
                    Initial Stock *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={quickAddOpeningStock}
                    onChange={(e) => setQuickAddOpeningStock(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 p-2.5 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 flex space-x-2.5">
                <button
                  type="submit"
                  disabled={quickAddLoading}
                  className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 text-sm font-bold text-white shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{quickAddLoading ? 'Saving...' : 'Save & Add to Cart'}</span>
                </button>
                <button
                  type="button"
                  disabled={quickAddLoading}
                  onClick={() => setShowQuickAddModal(false)}
                  className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
