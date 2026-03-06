import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  User,
  Company,
  Branch,
  Transaction,
  Counterparty,
  InventoryItem,
  Employee,
  AuditLog,
  ChatMessage,
  ChatRoom,
  SubscriptionPlanDetail,
  Payment,
} from './entities';
import {
  UserRole,
  CompanyType,
  SubscriptionPlan,
  TransactionType,
  TransactionStatus,
  CounterpartyType,
  ChatRoomType,
  MessageType,
  PlanCode,
  PaymentMethod,
  PaymentStatus,
  BillingPeriod,
} from './entities';

async function seed() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '1111',
    database: process.env.DB_NAME || 'aniq_hisob',
    entities: [
      User,
      Company,
      Branch,
      Transaction,
      Counterparty,
      InventoryItem,
      Employee,
      AuditLog,
      ChatMessage,
      ChatRoom,
      SubscriptionPlanDetail,
      Payment,
    ],
    synchronize: true,
  });

  await dataSource.initialize();
  console.log('Database connected. Seeding...');

  // Clear existing data in correct order (respect foreign keys)
  await dataSource.query('DELETE FROM payments');
  await dataSource.query('DELETE FROM chat_messages');
  await dataSource.query('DELETE FROM chat_room_participants');
  await dataSource.query('DELETE FROM chat_rooms');
  await dataSource.query('DELETE FROM audit_logs');
  await dataSource.query('DELETE FROM transactions');
  await dataSource.query('DELETE FROM counterparties');
  await dataSource.query('DELETE FROM inventory_items');
  await dataSource.query('DELETE FROM employees');
  await dataSource.query('DELETE FROM branches');
  await dataSource.query('DELETE FROM users');
  await dataSource.query('DELETE FROM companies');
  await dataSource.query('DELETE FROM subscription_plans');
  console.log('Old data cleared.');

  const userRepo = dataSource.getRepository(User);
  const companyRepo = dataSource.getRepository(Company);
  const branchRepo = dataSource.getRepository(Branch);
  const txRepo = dataSource.getRepository(Transaction);
  const cpRepo = dataSource.getRepository(Counterparty);
  const itemRepo = dataSource.getRepository(InventoryItem);
  const empRepo = dataSource.getRepository(Employee);
  const auditRepo = dataSource.getRepository(AuditLog);
  const roomRepo = dataSource.getRepository(ChatRoom);
  const msgRepo = dataSource.getRepository(ChatMessage);
  const planRepo = dataSource.getRepository(SubscriptionPlanDetail);
  const paymentRepo = dataSource.getRepository(Payment);

  // ══════════════════════════════════════════════════════
  //  SUBSCRIPTION PLANS (4 plans)
  // ══════════════════════════════════════════════════════
  await planRepo.save(planRepo.create({
    name: 'Bepul',
    code: PlanCode.FREE,
    description: 'Boshlang\'ich rejim — kichik biznes yoki sinov uchun',
    monthlyPrice: 0,
    yearlyPrice: 0,
    currency: 'UZS',
    features: ['Dashboard', 'Tranzaksiyalar (cheklangan)', 'Chat', 'Asosiy hisobotlar'],
    limits: { maxUsers: 2, maxBranches: 1, maxTransactionsPerMonth: 50, maxInventoryItems: 20, maxEmployees: 5 },
    sortOrder: 0,
  }));

  await planRepo.save(planRepo.create({
    name: 'Asosiy',
    code: PlanCode.BASIC,
    description: 'O\'sib borayotgan biznes uchun zarur vositalar',
    monthlyPrice: 299000,
    yearlyPrice: 2990000,
    currency: 'UZS',
    features: ['Dashboard', 'Tranzaksiyalar', 'Kontragentlar', 'Ombor boshqaruvi', 'Xodimlar', 'Filiallar (2 tagacha)', 'Chat', 'Hisobotlar', 'Audit log'],
    limits: { maxUsers: 5, maxBranches: 2, maxTransactionsPerMonth: 500, maxInventoryItems: 100, maxEmployees: 20 },
    sortOrder: 1,
  }));

  await planRepo.save(planRepo.create({
    name: 'Professional',
    code: PlanCode.PROFESSIONAL,
    description: 'To\'liq buxgalteriya xizmatlari — o\'rta va yirik kompaniyalar uchun',
    monthlyPrice: 699000,
    yearlyPrice: 6990000,
    currency: 'UZS',
    features: ['Dashboard', 'Tranzaksiyalar', 'Kontragentlar', 'Ombor boshqaruvi', 'Xodimlar', 'Filiallar (10 tagacha)', 'Chat', 'Kengaytirilgan hisobotlar', 'Audit log', 'Multi-valyuta', 'API integratsiya', 'Eksport (Excel/PDF)'],
    limits: { maxUsers: 20, maxBranches: 10, maxTransactionsPerMonth: 5000, maxInventoryItems: 1000, maxEmployees: 100 },
    sortOrder: 2,
  }));

  await planRepo.save(planRepo.create({
    name: 'Enterprise',
    code: PlanCode.ENTERPRISE,
    description: 'Cheksiz imkoniyatlar — korporativ darajadagi xizmat',
    monthlyPrice: 1490000,
    yearlyPrice: 14900000,
    currency: 'UZS',
    features: ['Dashboard', 'Tranzaksiyalar', 'Kontragentlar', 'Ombor boshqaruvi', 'Xodimlar', 'Filiallar (cheksiz)', 'Chat', 'Premium hisobotlar', 'Audit log', 'Multi-valyuta', 'API integratsiya', 'Eksport (Excel/PDF)', 'Shaxsiy menejer', 'Prioritet yordam', 'Custom integratsiya'],
    limits: { maxUsers: -1, maxBranches: -1, maxTransactionsPerMonth: -1, maxInventoryItems: -1, maxEmployees: -1 },
    sortOrder: 3,
  }));

  console.log('✓ 4 Subscription plans created');

  // ══════════════════════════════════════════════════════
  //  COMPANIES (5 companies)
  // ══════════════════════════════════════════════════════
  const accountingFirm = await companyRepo.save(
    companyRepo.create({
      name: 'Aniq Hisob Accounting',
      type: CompanyType.ACCOUNTING_FIRM,
      inn: '305123456',
      address: 'Tashkent, Amir Temur ko\'chasi 15',
      phone: '+998712001234',
      email: 'info@aniqhisob.uz',
      subscriptionPlan: SubscriptionPlan.ENTERPRISE,
      subscriptionExpiresAt: new Date('2027-12-31'),
      defaultCurrency: 'UZS',
      settings: { language: 'uz', timezone: 'Asia/Tashkent', notifications: true },
    }),
  );

  const silkRoad = await companyRepo.save(
    companyRepo.create({
      name: 'Silk Road Trading LLC',
      type: CompanyType.CLIENT,
      inn: '305987654',
      address: 'Tashkent, Navoi ko\'chasi 45',
      phone: '+998712005678',
      email: 'info@silkroad.uz',
      subscriptionPlan: SubscriptionPlan.PROFESSIONAL,
      subscriptionExpiresAt: new Date('2026-12-31'),
      defaultCurrency: 'UZS',
      accountingFirmId: accountingFirm.id,
      settings: { language: 'uz', autoApprove: false },
    }),
  );

  const greenValley = await companyRepo.save(
    companyRepo.create({
      name: 'Green Valley Agro',
      type: CompanyType.CLIENT,
      inn: '305456789',
      address: 'Samarkand, Registon ko\'chasi 7',
      phone: '+998662003456',
      email: 'info@greenvalley.uz',
      subscriptionPlan: SubscriptionPlan.BASIC,
      subscriptionExpiresAt: new Date('2026-09-30'),
      defaultCurrency: 'UZS',
      accountingFirmId: accountingFirm.id,
      settings: { language: 'uz' },
    }),
  );

  const technoPlus = await companyRepo.save(
    companyRepo.create({
      name: 'TechnoPlus Solutions',
      type: CompanyType.CLIENT,
      inn: '305111222',
      address: 'Tashkent, IT Park, Building 3',
      phone: '+998712009876',
      email: 'hello@technoplus.uz',
      subscriptionPlan: SubscriptionPlan.PROFESSIONAL,
      subscriptionExpiresAt: new Date('2027-03-31'),
      defaultCurrency: 'UZS',
      accountingFirmId: accountingFirm.id,
      settings: { language: 'en', multiCurrency: true },
    }),
  );

  const bukhFood = await companyRepo.save(
    companyRepo.create({
      name: 'Bukhara Food Export',
      type: CompanyType.CLIENT,
      inn: '305333444',
      address: 'Bukhara, Mekhtar Anbar 12',
      phone: '+998652007777',
      email: 'export@bukharafood.uz',
      subscriptionPlan: SubscriptionPlan.FREE,
      defaultCurrency: 'USD',
      accountingFirmId: accountingFirm.id,
    }),
  );

  console.log('✓ 5 Companies created');

  // ══════════════════════════════════════════════════════
  //  BRANCHES (8 branches across companies)
  // ══════════════════════════════════════════════════════
  const brAhMain = await branchRepo.save(branchRepo.create({ name: 'Bosh ofis (Accounting)', address: 'Tashkent, Amir Temur 15', phone: '+998712001234', companyId: accountingFirm.id }));

  const brSrMain = await branchRepo.save(branchRepo.create({ name: 'Bosh ofis', address: 'Tashkent, Navoi 45', phone: '+998712005678', companyId: silkRoad.id }));
  const brSrWarehouse = await branchRepo.save(branchRepo.create({ name: 'Asosiy ombor', address: 'Tashkent, Sanoat hududi 12', phone: '+998712005679', companyId: silkRoad.id }));
  const brSrShop = await branchRepo.save(branchRepo.create({ name: 'Chakana do\'kon', address: 'Tashkent, Chorsu bozori', phone: '+998712005680', companyId: silkRoad.id }));

  const brGvFarm = await branchRepo.save(branchRepo.create({ name: 'Asosiy ferma', address: 'Samarkand, Registon 7', phone: '+998662003456', companyId: greenValley.id }));
  const brGvGreenhouse = await branchRepo.save(branchRepo.create({ name: 'Issiqxona', address: 'Samarkand, Qo\'shrabot yo\'li', companyId: greenValley.id }));

  const brTpOffice = await branchRepo.save(branchRepo.create({ name: 'IT Park ofis', address: 'Tashkent, IT Park, Building 3', phone: '+998712009876', companyId: technoPlus.id }));

  const brBfExport = await branchRepo.save(branchRepo.create({ name: 'Eksport markazi', address: 'Bukhara, Mekhtar Anbar 12', phone: '+998652007777', companyId: bukhFood.id }));

  console.log('✓ 8 Branches created');

  // ══════════════════════════════════════════════════════
  //  USERS (12 users)
  // ══════════════════════════════════════════════════════
  const hash = await bcrypt.hash('password123', 12);

  const adminUser = await userRepo.save(userRepo.create({ email: 'admin@aniqhisob.uz', password: hash, firstName: 'Super', lastName: 'Admin', role: UserRole.PLATFORM_ADMIN, companyId: accountingFirm.id, lastLoginAt: new Date('2026-03-06T08:00:00') }));
  const alisher = await userRepo.save(userRepo.create({ email: 'accountant@aniqhisob.uz', password: hash, firstName: 'Alisher', lastName: 'Karimov', phone: '+998901234567', role: UserRole.ACCOUNTANT_ADMIN, companyId: accountingFirm.id, lastLoginAt: new Date('2026-03-06T09:15:00') }));
  const dilnoza = await userRepo.save(userRepo.create({ email: 'staff@aniqhisob.uz', password: hash, firstName: 'Dilnoza', lastName: 'Rahimova', phone: '+998901234568', role: UserRole.ACCOUNTANT, companyId: accountingFirm.id, lastLoginAt: new Date('2026-03-05T14:30:00') }));
  const shaxlo = await userRepo.save(userRepo.create({ email: 'shaxlo@aniqhisob.uz', password: hash, firstName: 'Shaxlo', lastName: 'Mirzayeva', phone: '+998935551122', role: UserRole.ACCOUNTANT, companyId: accountingFirm.id, lastLoginAt: new Date('2026-03-04T11:00:00') }));

  const bobur = await userRepo.save(userRepo.create({ email: 'ceo@silkroad.uz', password: hash, firstName: 'Bobur', lastName: 'Umarov', phone: '+998901234569', role: UserRole.CLIENT_ADMIN, companyId: silkRoad.id, lastLoginAt: new Date('2026-03-06T07:30:00') }));
  const sardor = await userRepo.save(userRepo.create({ email: 'worker@silkroad.uz', password: hash, firstName: 'Sardor', lastName: 'Toshmatov', phone: '+998901234570', role: UserRole.CLIENT_USER, companyId: silkRoad.id, lastLoginAt: new Date('2026-03-05T16:45:00') }));
  const feruza = await userRepo.save(userRepo.create({ email: 'feruza@silkroad.uz', password: hash, firstName: 'Feruza', lastName: 'Aliyeva', phone: '+998937778899', role: UserRole.VIEWER, companyId: silkRoad.id }));

  const nodira = await userRepo.save(userRepo.create({ email: 'director@greenvalley.uz', password: hash, firstName: 'Nodira', lastName: 'Nazarova', phone: '+998901234571', role: UserRole.CLIENT_ADMIN, companyId: greenValley.id, lastLoginAt: new Date('2026-03-05T10:00:00') }));
  const ulugbek = await userRepo.save(userRepo.create({ email: 'ulugbek@greenvalley.uz', password: hash, firstName: 'Ulug\'bek', lastName: 'Soliyev', phone: '+998944445566', role: UserRole.CLIENT_USER, companyId: greenValley.id }));

  const akbar = await userRepo.save(userRepo.create({ email: 'akbar@technoplus.uz', password: hash, firstName: 'Akbar', lastName: 'Xasanov', phone: '+998906667788', role: UserRole.CLIENT_ADMIN, companyId: technoPlus.id, lastLoginAt: new Date('2026-03-06T10:20:00') }));
  const kamola = await userRepo.save(userRepo.create({ email: 'kamola@technoplus.uz', password: hash, firstName: 'Kamola', lastName: 'Turgʻunova', phone: '+998912223344', role: UserRole.CLIENT_USER, companyId: technoPlus.id }));

  const sanjar = await userRepo.save(userRepo.create({ email: 'sanjar@bukharafood.uz', password: hash, firstName: 'Sanjar', lastName: 'Raxmatullayev', phone: '+998951112233', role: UserRole.CLIENT_ADMIN, companyId: bukhFood.id, lastLoginAt: new Date('2026-03-03T13:00:00') }));

  console.log('✓ 12 Users created');

  // ══════════════════════════════════════════════════════
  //  COUNTERPARTIES (12 counterparties)
  // ══════════════════════════════════════════════════════
  // Silk Road counterparties
  const cpChinaImport = await cpRepo.save(cpRepo.create({ name: 'China Import Co.', type: CounterpartyType.SUPPLIER, phone: '+8613012345678', email: 'contact@chinaimport.cn', contactPerson: 'Li Wei', inn: '91310000MA1FL8TX3X', address: 'Shanghai, China', debtBalance: -5000000, debtCurrency: 'UZS', companyId: silkRoad.id }));
  const cpMega = await cpRepo.save(cpRepo.create({ name: 'Mega Market', type: CounterpartyType.CLIENT, phone: '+998712009999', email: 'orders@megamarket.uz', contactPerson: 'Rustam Saidov', address: 'Tashkent, Buyuk Ipak Yoʻli 15', debtBalance: 15000000, debtCurrency: 'UZS', companyId: silkRoad.id }));
  const cpKorzinka = await cpRepo.save(cpRepo.create({ name: 'Korzinka Supermarket', type: CounterpartyType.CLIENT, phone: '+998712008888', contactPerson: 'Sherzod Xolmatov', address: 'Tashkent', debtBalance: 8000000, debtCurrency: 'UZS', companyId: silkRoad.id }));
  const cpTurkImport = await cpRepo.save(cpRepo.create({ name: 'Istanbul Textile Group', type: CounterpartyType.SUPPLIER, phone: '+905321234567', email: 'b2b@istanbultextile.com', contactPerson: 'Mehmet Yılmaz', inn: 'TR1234567890', address: 'Istanbul, Turkey', debtBalance: -12000000, debtCurrency: 'UZS', companyId: silkRoad.id }));
  const cpMakro = await cpRepo.save(cpRepo.create({ name: 'Makro Supermarket', type: CounterpartyType.CLIENT, phone: '+998712007766', email: 'supply@makro.uz', contactPerson: 'Jamshid Kamolov', debtBalance: 22000000, debtCurrency: 'UZS', companyId: silkRoad.id }));

  // Green Valley counterparties
  const cpFermerBazar = await cpRepo.save(cpRepo.create({ name: 'Toshkent Fermer Bozori', type: CounterpartyType.CLIENT, phone: '+998712004444', contactPerson: 'Anvar', address: 'Tashkent, Fermer bozori', debtBalance: 6000000, debtCurrency: 'UZS', companyId: greenValley.id }));
  const cpSeedSupply = await cpRepo.save(cpRepo.create({ name: 'AgroSeed Uzbekistan', type: CounterpartyType.SUPPLIER, phone: '+998662001111', email: 'sales@agroseed.uz', contactPerson: 'Otabek Normatov', debtBalance: -3500000, debtCurrency: 'UZS', companyId: greenValley.id }));
  const cpRestaurant = await cpRepo.save(cpRepo.create({ name: 'Registon Restaurant Chain', type: CounterpartyType.CLIENT, phone: '+998662005555', contactPerson: 'Farhod', debtBalance: 4500000, debtCurrency: 'UZS', companyId: greenValley.id }));

  // TechnoPlus counterparties
  const cpGovTech = await cpRepo.save(cpRepo.create({ name: 'UZINFOCOM', type: CounterpartyType.CLIENT, phone: '+998712006666', email: 'contracts@uzinfocom.uz', contactPerson: 'Maruf Ismoilov', debtBalance: 85000000, debtCurrency: 'UZS', companyId: technoPlus.id }));
  const cpCloudVendor = await cpRepo.save(cpRepo.create({ name: 'AWS Reseller Central Asia', type: CounterpartyType.SUPPLIER, phone: '+77012345678', email: 'support@awsca.kz', contactPerson: 'Asel Nurbekova', debtBalance: -4500, debtCurrency: 'USD', companyId: technoPlus.id, metadata: { currency: 'USD' } }));

  // Bukhara Food counterparties
  const cpDubaiTrader = await cpRepo.save(cpRepo.create({ name: 'Dubai Dry Fruits LLC', type: CounterpartyType.CLIENT, phone: '+971501234567', email: 'import@dubaidryfruits.ae', contactPerson: 'Ahmed Al-Rashid', debtBalance: 18000, debtCurrency: 'USD', companyId: bukhFood.id }));
  const cpLocalFarmer = await cpRepo.save(cpRepo.create({ name: 'Bukhara Dehqon Birjasi', type: CounterpartyType.SUPPLIER, phone: '+998652008888', contactPerson: 'Qodir aka', debtBalance: -25000000, debtCurrency: 'UZS', companyId: bukhFood.id }));

  console.log('✓ 12 Counterparties created');

  // ══════════════════════════════════════════════════════
  //  TRANSACTIONS (30 transactions across all companies)
  // ══════════════════════════════════════════════════════
  const txData = [
    // --- Silk Road (15 tx) ---
    { type: TransactionType.INCOME, amount: 25000000, currency: 'UZS', description: 'Mega Market — yanvar oyi hisob-faktura', category: 'Sotuv', status: TransactionStatus.APPROVED, companyId: silkRoad.id, branchId: brSrMain.id, createdById: sardor.id, counterpartyId: cpMega.id, transactionDate: new Date('2026-01-10'), invoiceNumber: 'SR-2026-001' },
    { type: TransactionType.EXPENSE, amount: 15000000, currency: 'UZS', description: 'Xitoydan tovar yetkazib berish', category: 'Xarid', status: TransactionStatus.APPROVED, companyId: silkRoad.id, branchId: brSrWarehouse.id, createdById: bobur.id, counterpartyId: cpChinaImport.id, transactionDate: new Date('2026-01-15'), invoiceNumber: 'SR-2026-002' },
    { type: TransactionType.EXPENSE, amount: 3500000, currency: 'UZS', description: 'Ofis ijarasi — fevral', category: 'Ijara', status: TransactionStatus.APPROVED, companyId: silkRoad.id, branchId: brSrMain.id, createdById: bobur.id, transactionDate: new Date('2026-02-01'), invoiceNumber: 'SR-2026-003' },
    { type: TransactionType.INCOME, amount: 18500000, currency: 'UZS', description: 'Korzinka — fevral yetkazma', category: 'Sotuv', status: TransactionStatus.APPROVED, companyId: silkRoad.id, createdById: sardor.id, counterpartyId: cpKorzinka.id, transactionDate: new Date('2026-02-10'), invoiceNumber: 'SR-2026-004' },
    { type: TransactionType.EXPENSE, amount: 2000, currency: 'USD', exchangeRate: 12800, description: 'Xalqaro yuk tashish', category: 'Logistika', status: TransactionStatus.APPROVED, companyId: silkRoad.id, createdById: bobur.id, transactionDate: new Date('2026-02-15'), invoiceNumber: 'SR-2026-005' },
    { type: TransactionType.INCOME, amount: 30000000, currency: 'UZS', description: 'Mega Market — mart oyi buyurtma', category: 'Sotuv', status: TransactionStatus.APPROVED, companyId: silkRoad.id, createdById: sardor.id, counterpartyId: cpMega.id, transactionDate: new Date('2026-03-01'), invoiceNumber: 'SR-2026-006' },
    { type: TransactionType.EXPENSE, amount: 22000000, currency: 'UZS', description: 'Istanbul Textile — mato xaridi', category: 'Xarid', status: TransactionStatus.APPROVED, companyId: silkRoad.id, branchId: brSrWarehouse.id, createdById: bobur.id, counterpartyId: cpTurkImport.id, transactionDate: new Date('2026-02-20'), invoiceNumber: 'SR-2026-007' },
    { type: TransactionType.INCOME, amount: 35000000, currency: 'UZS', description: 'Makro — mart yetkazma', category: 'Sotuv', status: TransactionStatus.APPROVED, companyId: silkRoad.id, branchId: brSrShop.id, createdById: sardor.id, counterpartyId: cpMakro.id, transactionDate: new Date('2026-03-02'), invoiceNumber: 'SR-2026-008' },
    { type: TransactionType.EXPENSE, amount: 8500000, currency: 'UZS', description: 'Xodimlar oyligi — fevral', category: 'Maosh', status: TransactionStatus.APPROVED, companyId: silkRoad.id, branchId: brSrMain.id, createdById: bobur.id, transactionDate: new Date('2026-02-28') },
    { type: TransactionType.EXPENSE, amount: 1200000, currency: 'UZS', description: 'Komunal to\'lovlar', category: 'Kommunal', status: TransactionStatus.APPROVED, companyId: silkRoad.id, branchId: brSrMain.id, createdById: bobur.id, transactionDate: new Date('2026-02-25') },
    { type: TransactionType.INCOME, amount: 12000000, currency: 'UZS', description: 'Korzinka — mart buyurtma (oldindan)', category: 'Sotuv', status: TransactionStatus.PENDING, companyId: silkRoad.id, createdById: sardor.id, counterpartyId: cpKorzinka.id, transactionDate: new Date('2026-03-05'), invoiceNumber: 'SR-2026-009' },
    { type: TransactionType.EXPENSE, amount: 4200000, currency: 'UZS', description: 'Do\'kon ta\'mirlash xarajatlar', category: 'Ta\'mirlash', status: TransactionStatus.PENDING, companyId: silkRoad.id, branchId: brSrShop.id, createdById: bobur.id, transactionDate: new Date('2026-03-04') },
    { type: TransactionType.EXPENSE, amount: 780000, currency: 'UZS', description: 'Ofis jihozlari', category: 'Jihozlar', status: TransactionStatus.APPROVED, companyId: silkRoad.id, branchId: brSrMain.id, createdById: sardor.id, transactionDate: new Date('2026-01-22') },
    { type: TransactionType.EXPENSE, amount: 3500000, currency: 'UZS', description: 'Ofis ijarasi — mart', category: 'Ijara', status: TransactionStatus.APPROVED, companyId: silkRoad.id, branchId: brSrMain.id, createdById: bobur.id, transactionDate: new Date('2026-03-01') },
    { type: TransactionType.INCOME, amount: 5500000, currency: 'UZS', description: 'Chakana sotuv — fevral', category: 'Sotuv', status: TransactionStatus.APPROVED, companyId: silkRoad.id, branchId: brSrShop.id, createdById: sardor.id, transactionDate: new Date('2026-02-28') },

    // --- Green Valley (7 tx) ---
    { type: TransactionType.INCOME, amount: 12000000, currency: 'UZS', description: 'Qishloq mahsulotlari sotish', category: 'Sotuv', status: TransactionStatus.APPROVED, companyId: greenValley.id, branchId: brGvFarm.id, createdById: nodira.id, counterpartyId: cpFermerBazar.id, transactionDate: new Date('2026-02-01') },
    { type: TransactionType.EXPENSE, amount: 4500000, currency: 'UZS', description: 'Urug\'lik va o\'g\'itlar xaridi', category: 'Materiallar', status: TransactionStatus.APPROVED, companyId: greenValley.id, branchId: brGvFarm.id, createdById: nodira.id, counterpartyId: cpSeedSupply.id, transactionDate: new Date('2026-02-05') },
    { type: TransactionType.INCOME, amount: 8500000, currency: 'UZS', description: 'Restoranlarga sabzavot yetkazma', category: 'Sotuv', status: TransactionStatus.APPROVED, companyId: greenValley.id, createdById: nodira.id, counterpartyId: cpRestaurant.id, transactionDate: new Date('2026-02-15') },
    { type: TransactionType.EXPENSE, amount: 6000000, currency: 'UZS', description: 'Issiqxona jihozlash', category: 'Jihozlar', status: TransactionStatus.APPROVED, companyId: greenValley.id, branchId: brGvGreenhouse.id, createdById: nodira.id, transactionDate: new Date('2026-01-20') },
    { type: TransactionType.EXPENSE, amount: 2800000, currency: 'UZS', description: 'Dehqonlar oyligi', category: 'Maosh', status: TransactionStatus.APPROVED, companyId: greenValley.id, createdById: nodira.id, transactionDate: new Date('2026-02-28') },
    { type: TransactionType.INCOME, amount: 15000000, currency: 'UZS', description: 'Bug\'doy hasili sotuv', category: 'Sotuv', status: TransactionStatus.APPROVED, companyId: greenValley.id, branchId: brGvFarm.id, createdById: ulugbek.id, counterpartyId: cpFermerBazar.id, transactionDate: new Date('2026-03-01') },
    { type: TransactionType.EXPENSE, amount: 1500000, currency: 'UZS', description: 'Transport xarajatlari', category: 'Logistika', status: TransactionStatus.PENDING, companyId: greenValley.id, createdById: ulugbek.id, transactionDate: new Date('2026-03-03') },

    // --- TechnoPlus (5 tx) ---
    { type: TransactionType.INCOME, amount: 85000000, currency: 'UZS', description: 'UZINFOCOM — dasturiy ta\'minot loyihasi', category: 'Xizmatlar', status: TransactionStatus.APPROVED, companyId: technoPlus.id, branchId: brTpOffice.id, createdById: akbar.id, counterpartyId: cpGovTech.id, transactionDate: new Date('2026-01-30'), invoiceNumber: 'TP-2026-001' },
    { type: TransactionType.EXPENSE, amount: 4500, currency: 'USD', exchangeRate: 12800, description: 'AWS bulut xizmatlari (3 oylik)', category: 'Infratuzilma', status: TransactionStatus.APPROVED, companyId: technoPlus.id, createdById: akbar.id, counterpartyId: cpCloudVendor.id, transactionDate: new Date('2026-02-01'), invoiceNumber: 'TP-2026-002' },
    { type: TransactionType.EXPENSE, amount: 25000000, currency: 'UZS', description: 'Dasturchilar oyligi — fevral', category: 'Maosh', status: TransactionStatus.APPROVED, companyId: technoPlus.id, branchId: brTpOffice.id, createdById: akbar.id, transactionDate: new Date('2026-02-28') },
    { type: TransactionType.INCOME, amount: 35000000, currency: 'UZS', description: 'Mobil ilova ishlab chiqish (1-bosqich)', category: 'Xizmatlar', status: TransactionStatus.PENDING, companyId: technoPlus.id, branchId: brTpOffice.id, createdById: kamola.id, counterpartyId: cpGovTech.id, transactionDate: new Date('2026-03-05'), invoiceNumber: 'TP-2026-003' },
    { type: TransactionType.EXPENSE, amount: 8000000, currency: 'UZS', description: 'Ofis ijarasi va kommunal', category: 'Ijara', status: TransactionStatus.APPROVED, companyId: technoPlus.id, branchId: brTpOffice.id, createdById: akbar.id, transactionDate: new Date('2026-02-01') },

    // --- Bukhara Food (3 tx) ---
    { type: TransactionType.INCOME, amount: 18000, currency: 'USD', exchangeRate: 12800, description: 'Quritilgan meva eksporti — Dubai', category: 'Eksport', status: TransactionStatus.APPROVED, companyId: bukhFood.id, branchId: brBfExport.id, createdById: sanjar.id, counterpartyId: cpDubaiTrader.id, transactionDate: new Date('2026-02-10'), invoiceNumber: 'BF-2026-001' },
    { type: TransactionType.EXPENSE, amount: 25000000, currency: 'UZS', description: 'Dehqonlardan xomashyo xaridi', category: 'Xarid', status: TransactionStatus.APPROVED, companyId: bukhFood.id, branchId: brBfExport.id, createdById: sanjar.id, counterpartyId: cpLocalFarmer.id, transactionDate: new Date('2026-01-25'), invoiceNumber: 'BF-2026-002' },
    { type: TransactionType.EXPENSE, amount: 3200, currency: 'USD', exchangeRate: 12800, description: 'Qadoqlash materiallari importi', category: 'Materiallar', status: TransactionStatus.APPROVED, companyId: bukhFood.id, createdById: sanjar.id, transactionDate: new Date('2026-02-18') },
  ];

  for (const tx of txData) {
    await txRepo.save(txRepo.create(tx));
  }
  console.log('✓ 30 Transactions created');

  // ══════════════════════════════════════════════════════
  //  INVENTORY ITEMS (18 items)
  // ══════════════════════════════════════════════════════
  const invData = [
    // Silk Road (8 items)
    { name: 'Ipak mato (Premium)', sku: 'SLK-001', barcode: '4780001234567', category: 'Gazlama', unit: 'metr', quantity: 500, costPrice: 45000, sellPrice: 75000, currency: 'UZS', minStockLevel: 50, companyId: silkRoad.id, description: 'Yuqori sifatli tabiiy ipak matosi' },
    { name: 'Paxta futbolka (Oq)', sku: 'TSH-001', barcode: '4780001234568', category: 'Kiyim', unit: 'dona', quantity: 200, costPrice: 25000, sellPrice: 55000, currency: 'UZS', minStockLevel: 30, companyId: silkRoad.id },
    { name: 'Jun gilam (Katta)', sku: 'CRP-001', barcode: '4780001234569', category: 'Uy jihozlari', unit: 'dona', quantity: 15, costPrice: 850000, sellPrice: 1500000, currency: 'UZS', minStockLevel: 5, companyId: silkRoad.id },
    { name: 'Atlas ko\'ylak matosi', sku: 'ATL-001', barcode: '4780001234570', category: 'Gazlama', unit: 'metr', quantity: 320, costPrice: 65000, sellPrice: 120000, currency: 'UZS', minStockLevel: 40, companyId: silkRoad.id },
    { name: 'Charm sumka', sku: 'BAG-001', barcode: '4780001234571', category: 'Aksessuar', unit: 'dona', quantity: 45, costPrice: 180000, sellPrice: 350000, currency: 'UZS', minStockLevel: 10, companyId: silkRoad.id },
    { name: 'Paxta ip (rulonli)', sku: 'CTN-001', category: 'Xomashyo', unit: 'kg', quantity: 800, costPrice: 18000, sellPrice: 28000, currency: 'UZS', minStockLevel: 100, companyId: silkRoad.id },
    { name: 'Kamar tasma', sku: 'BLT-001', category: 'Aksessuar', unit: 'dona', quantity: 3, costPrice: 35000, sellPrice: 65000, currency: 'UZS', minStockLevel: 15, companyId: silkRoad.id, description: 'Kam qolgan — buyurtma kerak' },
    { name: 'Ro\'mol (Ipak)', sku: 'SCR-001', category: 'Aksessuar', unit: 'dona', quantity: 75, costPrice: 55000, sellPrice: 95000, currency: 'UZS', minStockLevel: 20, companyId: silkRoad.id },

    // Green Valley (6 items)
    { name: 'Organik pomidor', sku: 'TOM-001', category: 'Sabzavot', unit: 'kg', quantity: 2000, costPrice: 5000, sellPrice: 8000, currency: 'UZS', minStockLevel: 200, companyId: greenValley.id },
    { name: 'Organik bug\'doy', sku: 'WHT-001', category: 'Don', unit: 'kg', quantity: 10000, costPrice: 3000, sellPrice: 5000, currency: 'UZS', minStockLevel: 1000, companyId: greenValley.id },
    { name: 'Bodring', sku: 'CUC-001', category: 'Sabzavot', unit: 'kg', quantity: 1500, costPrice: 4000, sellPrice: 7000, currency: 'UZS', minStockLevel: 150, companyId: greenValley.id },
    { name: 'Tarvuz', sku: 'WTM-001', category: 'Meva', unit: 'kg', quantity: 5000, costPrice: 2000, sellPrice: 4500, currency: 'UZS', minStockLevel: 500, companyId: greenValley.id },
    { name: 'Qalampir (Qizil)', sku: 'PEP-001', category: 'Sabzavot', unit: 'kg', quantity: 350, costPrice: 12000, sellPrice: 20000, currency: 'UZS', minStockLevel: 50, companyId: greenValley.id },
    { name: 'Organik o\'g\'it', sku: 'FRT-001', category: 'Materiallar', unit: 'kg', quantity: 3000, costPrice: 2500, sellPrice: 0, currency: 'UZS', minStockLevel: 500, companyId: greenValley.id, description: 'Ichki foydalanish uchun' },

    // TechnoPlus (2 items)
    { name: 'Dell Monitor 27"', sku: 'MON-001', category: 'Jihozlar', unit: 'dona', quantity: 8, costPrice: 4500000, sellPrice: 0, currency: 'UZS', minStockLevel: 2, companyId: technoPlus.id, description: 'Ofis ichki foydalanish' },
    { name: 'MacBook Pro M3', sku: 'MBP-001', category: 'Jihozlar', unit: 'dona', quantity: 5, costPrice: 28000000, sellPrice: 0, currency: 'UZS', minStockLevel: 1, companyId: technoPlus.id },

    // Bukhara Food (2 items)
    { name: 'Quritilgan o\'rik', sku: 'APR-001', category: 'Quritilgan meva', unit: 'kg', quantity: 4000, costPrice: 35000, sellPrice: 85000, currency: 'UZS', minStockLevel: 500, companyId: bukhFood.id },
    { name: 'Yong\'oq (Charx)', sku: 'WNT-001', category: 'Quritilgan meva', unit: 'kg', quantity: 2500, costPrice: 60000, sellPrice: 130000, currency: 'UZS', minStockLevel: 300, companyId: bukhFood.id },
  ];

  for (const item of invData) {
    await itemRepo.save(itemRepo.create(item));
  }
  console.log('✓ 18 Inventory items created');

  // ══════════════════════════════════════════════════════
  //  EMPLOYEES (14 employees)
  // ══════════════════════════════════════════════════════
  const mkEmp = (d: any) => empRepo.create({ ...d, salaryHistory: [{ amount: d.salary, currency: d.salaryCurrency || 'UZS', date: (d.hireDate as Date).toISOString() }] });

  const empData = [
    // Silk Road (5)
    { firstName: 'Jasur', lastName: 'Mirzayev', phone: '+998901111111', position: 'Sotuv menejeri', department: 'Sotuv', salary: 8000000, salaryCurrency: 'UZS', hireDate: new Date('2024-01-15'), companyId: silkRoad.id },
    { firstName: 'Malika', lastName: 'Azizova', phone: '+998902222222', position: 'Ombor boshlig\'i', department: 'Logistika', salary: 6000000, salaryCurrency: 'UZS', hireDate: new Date('2024-03-01'), companyId: silkRoad.id },
    { firstName: 'Oybek', lastName: 'Tursunov', phone: '+998903333333', position: 'Haydovchi', department: 'Logistika', salary: 4500000, salaryCurrency: 'UZS', hireDate: new Date('2025-01-10'), companyId: silkRoad.id },
    { firstName: 'Dilfuza', lastName: 'Ergasheva', phone: '+998917776655', position: 'Do\'kon sotuvchi', department: 'Sotuv', salary: 3500000, salaryCurrency: 'UZS', hireDate: new Date('2025-06-01'), companyId: silkRoad.id },
    { firstName: 'Ravshan', lastName: 'Qodirov', phone: '+998933214567', position: 'Yuk tashuvchi', department: 'Logistika', salary: 4000000, salaryCurrency: 'UZS', hireDate: new Date('2025-09-15'), companyId: silkRoad.id },

    // Green Valley (3)
    { firstName: 'Zilola', lastName: 'Xamidova', phone: '+998904444444', position: 'Ferma menejeri', department: 'Operatsiyalar', salary: 7000000, salaryCurrency: 'UZS', hireDate: new Date('2023-06-01'), companyId: greenValley.id },
    { firstName: 'Bahrom', lastName: 'To\'rayev', phone: '+998946665544', position: 'Issiqxona mutaxassisi', department: 'Ishlab chiqarish', salary: 5500000, salaryCurrency: 'UZS', hireDate: new Date('2024-09-01'), companyId: greenValley.id },
    { firstName: 'Habiba', lastName: 'Sobirov', phone: '+998977889900', position: 'Dehqon', department: 'Ishlab chiqarish', salary: 3800000, salaryCurrency: 'UZS', hireDate: new Date('2024-04-15'), companyId: greenValley.id },

    // TechnoPlus (4)
    { firstName: 'Mirzo', lastName: 'Abdullayev', phone: '+998901122334', position: 'Senior dasturchi', department: 'Engineering', salary: 18000000, salaryCurrency: 'UZS', hireDate: new Date('2023-02-01'), companyId: technoPlus.id },
    { firstName: 'Sevara', lastName: 'Qosimova', phone: '+998915566778', position: 'UI/UX dizayner', department: 'Design', salary: 12000000, salaryCurrency: 'UZS', hireDate: new Date('2024-01-15'), companyId: technoPlus.id },
    { firstName: 'Behruz', lastName: 'Normatov', phone: '+998929988776', position: 'Backend dasturchi', department: 'Engineering', salary: 15000000, salaryCurrency: 'UZS', hireDate: new Date('2024-06-01'), companyId: technoPlus.id },
    { firstName: 'Lola', lastName: 'Xasanova', phone: '+998938877665', position: 'Project Manager', department: 'Management', salary: 14000000, salaryCurrency: 'UZS', hireDate: new Date('2023-09-01'), companyId: technoPlus.id },

    // Bukhara Food (2)
    { firstName: 'Davron', lastName: 'Jurayev', phone: '+998951234567', position: 'Eksport menejeri', department: 'Sotuv', salary: 9000000, salaryCurrency: 'UZS', hireDate: new Date('2024-02-01'), companyId: bukhFood.id },
    { firstName: 'Gulbahor', lastName: 'Murodova', phone: '+998957654321', position: 'Sifat nazoratchi', department: 'Ishlab chiqarish', salary: 5000000, salaryCurrency: 'UZS', hireDate: new Date('2025-03-01'), companyId: bukhFood.id },
  ];

  for (const emp of empData) {
    await empRepo.save(mkEmp(emp));
  }
  console.log('✓ 14 Employees created');

  // ══════════════════════════════════════════════════════
  //  AUDIT LOGS (20 logs)
  // ══════════════════════════════════════════════════════
  const auditData = [
    { action: 'user.login', entityType: 'User', entityId: adminUser.id, companyId: accountingFirm.id, userId: adminUser.id, ipAddress: '192.168.1.10', userAgent: 'Mozilla/5.0 Chrome/122.0' },
    { action: 'company.create', entityType: 'Company', entityId: silkRoad.id, companyId: accountingFirm.id, userId: adminUser.id, newData: { name: 'Silk Road Trading LLC' }, ipAddress: '192.168.1.10' },
    { action: 'company.create', entityType: 'Company', entityId: greenValley.id, companyId: accountingFirm.id, userId: adminUser.id, newData: { name: 'Green Valley Agro' }, ipAddress: '192.168.1.10' },
    { action: 'company.create', entityType: 'Company', entityId: technoPlus.id, companyId: accountingFirm.id, userId: adminUser.id, newData: { name: 'TechnoPlus Solutions' }, ipAddress: '192.168.1.10' },
    { action: 'user.login', entityType: 'User', entityId: bobur.id, companyId: silkRoad.id, userId: bobur.id, ipAddress: '10.0.0.55', userAgent: 'Mozilla/5.0 Safari/17.2' },
    { action: 'transaction.create', entityType: 'Transaction', companyId: silkRoad.id, userId: sardor.id, newData: { type: 'income', amount: 25000000, description: 'Mega Market yanvar' }, ipAddress: '10.0.0.55' },
    { action: 'transaction.create', entityType: 'Transaction', companyId: silkRoad.id, userId: bobur.id, newData: { type: 'expense', amount: 15000000, description: 'China Import xaridi' }, ipAddress: '10.0.0.55' },
    { action: 'transaction.approve', entityType: 'Transaction', companyId: silkRoad.id, userId: alisher.id, oldData: { status: 'pending' }, newData: { status: 'approved' }, ipAddress: '192.168.1.12' },
    { action: 'employee.create', entityType: 'Employee', companyId: silkRoad.id, userId: bobur.id, newData: { name: 'Jasur Mirzayev', position: 'Sotuv menejeri' }, ipAddress: '10.0.0.55' },
    { action: 'inventory.update', entityType: 'InventoryItem', companyId: silkRoad.id, userId: sardor.id, oldData: { quantity: 450 }, newData: { quantity: 500 }, ipAddress: '10.0.0.55' },
    { action: 'user.login', entityType: 'User', entityId: nodira.id, companyId: greenValley.id, userId: nodira.id, ipAddress: '172.16.0.20', userAgent: 'Mozilla/5.0 Firefox/123.0' },
    { action: 'transaction.create', entityType: 'Transaction', companyId: greenValley.id, userId: nodira.id, newData: { type: 'income', amount: 12000000, category: 'Sotuv' }, ipAddress: '172.16.0.20' },
    { action: 'counterparty.create', entityType: 'Counterparty', companyId: greenValley.id, userId: nodira.id, newData: { name: 'Toshkent Fermer Bozori' }, ipAddress: '172.16.0.20' },
    { action: 'user.login', entityType: 'User', entityId: akbar.id, companyId: technoPlus.id, userId: akbar.id, ipAddress: '10.10.10.5', userAgent: 'Mozilla/5.0 Chrome/122.0' },
    { action: 'transaction.create', entityType: 'Transaction', companyId: technoPlus.id, userId: akbar.id, newData: { type: 'income', amount: 85000000, description: 'UZINFOCOM loyiha' }, ipAddress: '10.10.10.5' },
    { action: 'employee.update', entityType: 'Employee', companyId: technoPlus.id, userId: akbar.id, oldData: { salary: 16000000 }, newData: { salary: 18000000, note: 'Oylik oshirish' }, ipAddress: '10.10.10.5' },
    { action: 'user.login', entityType: 'User', entityId: sanjar.id, companyId: bukhFood.id, userId: sanjar.id, ipAddress: '192.168.50.1', userAgent: 'Mozilla/5.0 Chrome/121.0' },
    { action: 'transaction.create', entityType: 'Transaction', companyId: bukhFood.id, userId: sanjar.id, newData: { type: 'income', amount: 18000, currency: 'USD', description: 'Dubai eksport' }, ipAddress: '192.168.50.1' },
    { action: 'user.password_change', entityType: 'User', entityId: dilnoza.id, companyId: accountingFirm.id, userId: dilnoza.id, ipAddress: '192.168.1.14' },
    { action: 'settings.update', entityType: 'Company', entityId: silkRoad.id, companyId: silkRoad.id, userId: bobur.id, oldData: { autoApprove: true }, newData: { autoApprove: false }, ipAddress: '10.0.0.55' },
  ];

  for (const log of auditData) {
    await auditRepo.save(auditRepo.create(log));
  }
  console.log('✓ 20 Audit logs created');

  // ══════════════════════════════════════════════════════
  //  CHAT ROOMS (5 rooms) + MESSAGES (25+ messages)
  // ══════════════════════════════════════════════════════
  // Room 1: Silk Road tax consultation
  const room1 = await roomRepo.save(roomRepo.create({
    name: 'Silk Road — Soliq maslahat',
    type: ChatRoomType.DIRECT,
    companyId: silkRoad.id,
    participants: [alisher, bobur],
  }));

  const room1Msgs = [
    { content: 'Assalomu alaykum! Yanvar oyi hisobotini yuborishingiz mumkinmi?', senderId: alisher.id, roomId: room1.id, type: MessageType.TEXT },
    { content: 'Vaalaykum assalom! Ha, albatta. Bugun kechgacha yuborib beraman.', senderId: bobur.id, roomId: room1.id, type: MessageType.TEXT },
    { content: 'Rahmat! QQS hisobotini ham birga yuboring, iltimos.', senderId: alisher.id, roomId: room1.id, type: MessageType.TEXT },
    { content: 'Xo\'p, tayyorlab qo\'yaman. Boshqa nima kerak?', senderId: bobur.id, roomId: room1.id, type: MessageType.TEXT },
    { content: 'Shuningdek, xodimlar royxatidagi o\'zgarishlar haqida ma\'lumot bering.', senderId: alisher.id, roomId: room1.id, type: MessageType.TEXT },
    { content: 'Yangi sotuvchi olganmiz — Dilfuza Ergasheva. Hujjatlarini yuboraman.', senderId: bobur.id, roomId: room1.id, type: MessageType.TEXT },
  ];
  for (const m of room1Msgs) { await msgRepo.save(msgRepo.create(m)); }

  // Room 2: Green Valley monthly
  const room2 = await roomRepo.save(roomRepo.create({
    name: 'Green Valley — Oylik hisobot',
    type: ChatRoomType.DIRECT,
    companyId: greenValley.id,
    participants: [dilnoza, nodira],
  }));

  const room2Msgs = [
    { content: 'Green Valley oylik hisoboti tayyor. Tekshirib ko\'ring.', senderId: dilnoza.id, roomId: room2.id, type: MessageType.TEXT },
    { content: 'Rahmat Dilnoza! Bir savol bor — issiqxona xarajatlari qaysi kategoriyada?', senderId: nodira.id, roomId: room2.id, type: MessageType.TEXT },
    { content: '"Jihozlar" kategoriyasida yozilgan. Alohida ajratishim kerakmi?', senderId: dilnoza.id, roomId: room2.id, type: MessageType.TEXT },
    { content: 'Ha, iltimos "Issiqxona" deb alohida kategoriya yarating.', senderId: nodira.id, roomId: room2.id, type: MessageType.TEXT },
    { content: 'Xo\'p, hozir tuzataman. 10 daqiqada tayyor bo\'ladi.', senderId: dilnoza.id, roomId: room2.id, type: MessageType.TEXT },
  ];
  for (const m of room2Msgs) { await msgRepo.save(msgRepo.create(m)); }

  // Room 3: TechnoPlus support
  const room3 = await roomRepo.save(roomRepo.create({
    name: 'TechnoPlus — Texnik yordam',
    type: ChatRoomType.SUPPORT,
    companyId: technoPlus.id,
    participants: [shaxlo, akbar],
  }));

  const room3Msgs = [
    { content: 'Salom! UZINFOCOM invoysini tizimga kiritishda muammo bor.', senderId: akbar.id, roomId: room3.id, type: MessageType.TEXT },
    { content: 'Salom Akbar! Qanday xatolik chiqyapti?', senderId: shaxlo.id, roomId: room3.id, type: MessageType.TEXT },
    { content: 'Summa juda katta deb yozilmoqda. 85 mln UZS kiritolmayapman.', senderId: akbar.id, roomId: room3.id, type: MessageType.TEXT },
    { content: 'Tushundim. Bu limitni admin oshirishi kerak. Hozir tuzatib beraman.', senderId: shaxlo.id, roomId: room3.id, type: MessageType.TEXT },
    { content: 'Tayyor! Qaytadan sinab ko\'ring.', senderId: shaxlo.id, roomId: room3.id, type: MessageType.TEXT },
    { content: 'Ishladi! Rahmat katta 👍', senderId: akbar.id, roomId: room3.id, type: MessageType.TEXT },
  ];
  for (const m of room3Msgs) { await msgRepo.save(msgRepo.create(m)); }

  // Room 4: Bukhara Food consultation
  const room4 = await roomRepo.save(roomRepo.create({
    name: 'Bukhara Food — Eksport hisob',
    type: ChatRoomType.DIRECT,
    companyId: bukhFood.id,
    participants: [alisher, sanjar],
  }));

  const room4Msgs = [
    { content: 'Sanjar aka, Dubai eksport uchun valyuta kursi qancha bo\'ldi?', senderId: alisher.id, roomId: room4.id, type: MessageType.TEXT },
    { content: '1 USD = 12,800 UZS bo\'yicha hisoblandi.', senderId: sanjar.id, roomId: room4.id, type: MessageType.TEXT },
    { content: 'Yaxshi. Bojxona to\'lovlari ham bo\'ldimi?', senderId: alisher.id, roomId: room4.id, type: MessageType.TEXT },
    { content: 'Ha, 3200 USD qadoqlash materiallari uchun alohida yozilgan.', senderId: sanjar.id, roomId: room4.id, type: MessageType.TEXT },
  ];
  for (const m of room4Msgs) { await msgRepo.save(msgRepo.create(m)); }

  // Room 5: Group chat — Accounting team
  const room5 = await roomRepo.save(roomRepo.create({
    name: 'Hisobchilar guruhi',
    type: ChatRoomType.GROUP,
    companyId: accountingFirm.id,
    participants: [alisher, dilnoza, shaxlo, adminUser],
  }));

  const room5Msgs = [
    { content: 'Hammaga salom! Mart oyi topshiriqlari ro\'yxatini joylayman.', senderId: alisher.id, roomId: room5.id, type: MessageType.TEXT },
    { content: '1. Silk Road QQS hisoboti\n2. Green Valley oylik\n3. TechnoPlus soliqlari\n4. Bukhara Food eksport hisob', senderId: alisher.id, roomId: room5.id, type: MessageType.TEXT },
    { content: 'Men Green Valley va Bukhara Food ni olaman.', senderId: dilnoza.id, roomId: room5.id, type: MessageType.TEXT },
    { content: 'Men TechnoPlus bilan shug\'ullanaman.', senderId: shaxlo.id, roomId: room5.id, type: MessageType.TEXT },
    { content: 'Zo\'r! Silk Road meniki. Juma kunigacha deadline.', senderId: alisher.id, roomId: room5.id, type: MessageType.TEXT },
  ];
  for (const m of room5Msgs) { await msgRepo.save(msgRepo.create(m)); }

  console.log('✓ 5 Chat rooms + 26 Messages created');

  // ══════════════════════════════════════════════════════
  //  PAYMENTS (6 payment records)
  // ══════════════════════════════════════════════════════
  await paymentRepo.save(paymentRepo.create({
    companyId: silkRoad.id,
    createdById: bobur.id,
    planCode: 'professional',
    billingPeriod: BillingPeriod.YEARLY,
    amount: 6990000,
    currency: 'UZS',
    paymentMethod: PaymentMethod.PAYME,
    status: PaymentStatus.PAID,
    orderId: 'AH-1709000001-sr01',
    providerTransactionId: 'payme_txn_001',
    paidAt: new Date('2026-01-02T10:30:00'),
    subscriptionExpiresAt: new Date('2026-12-31'),
  }));

  await paymentRepo.save(paymentRepo.create({
    companyId: greenValley.id,
    createdById: nodira.id,
    planCode: 'basic',
    billingPeriod: BillingPeriod.MONTHLY,
    amount: 299000,
    currency: 'UZS',
    paymentMethod: PaymentMethod.CLICK,
    status: PaymentStatus.PAID,
    orderId: 'AH-1709000002-gv01',
    providerTransactionId: 'click_txn_001',
    paidAt: new Date('2026-02-01T09:00:00'),
    subscriptionExpiresAt: new Date('2026-09-30'),
  }));

  await paymentRepo.save(paymentRepo.create({
    companyId: technoPlus.id,
    createdById: akbar.id,
    planCode: 'professional',
    billingPeriod: BillingPeriod.MONTHLY,
    amount: 699000,
    currency: 'UZS',
    paymentMethod: PaymentMethod.PAYME,
    status: PaymentStatus.PAID,
    orderId: 'AH-1709000003-tp01',
    providerTransactionId: 'payme_txn_002',
    paidAt: new Date('2026-02-15T14:20:00'),
    subscriptionExpiresAt: new Date('2027-03-31'),
  }));

  await paymentRepo.save(paymentRepo.create({
    companyId: technoPlus.id,
    createdById: akbar.id,
    planCode: 'professional',
    billingPeriod: BillingPeriod.MONTHLY,
    amount: 699000,
    currency: 'UZS',
    paymentMethod: PaymentMethod.CLICK,
    status: PaymentStatus.PAID,
    orderId: 'AH-1709000004-tp02',
    providerTransactionId: 'click_txn_002',
    paidAt: new Date('2026-01-15T11:00:00'),
    subscriptionExpiresAt: new Date('2026-02-15'),
  }));

  await paymentRepo.save(paymentRepo.create({
    companyId: bukhFood.id,
    createdById: sanjar.id,
    planCode: 'basic',
    billingPeriod: BillingPeriod.MONTHLY,
    amount: 299000,
    currency: 'UZS',
    paymentMethod: PaymentMethod.PAYME,
    status: PaymentStatus.PENDING,
    orderId: 'AH-1709000005-bf01',
  }));

  await paymentRepo.save(paymentRepo.create({
    companyId: greenValley.id,
    createdById: nodira.id,
    planCode: 'professional',
    billingPeriod: BillingPeriod.YEARLY,
    amount: 6990000,
    currency: 'UZS',
    paymentMethod: PaymentMethod.CLICK,
    status: PaymentStatus.FAILED,
    orderId: 'AH-1709000006-gv02',
    metadata: { failReason: 'Insufficient funds' },
  }));

  console.log('✓ 6 Payments created');

  // ══════════════════════════════════════════════════════
  //  SUMMARY
  // ══════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   Database seeded successfully!          ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  4  Subscription Plans                   ║');
  console.log('║  5  Companies                            ║');
  console.log('║  8  Branches                             ║');
  console.log('║  12 Users                                ║');
  console.log('║  12 Counterparties                       ║');
  console.log('║  30 Transactions                         ║');
  console.log('║  18 Inventory Items                      ║');
  console.log('║  14 Employees                            ║');
  console.log('║  20 Audit Logs                           ║');
  console.log('║  5  Chat Rooms                           ║');
  console.log('║  26 Chat Messages                        ║');
  console.log('║  6  Payments                             ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  Total: 160 records across 12 tables     ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('\nTest accounts (password: password123):');
  console.log('  Platform Admin:    admin@aniqhisob.uz');
  console.log('  Accountant Admin:  accountant@aniqhisob.uz');
  console.log('  Accountant:        staff@aniqhisob.uz');
  console.log('  Accountant:        shaxlo@aniqhisob.uz');
  console.log('  Client Admin (SR): ceo@silkroad.uz');
  console.log('  Client User (SR):  worker@silkroad.uz');
  console.log('  Viewer (SR):       feruza@silkroad.uz');
  console.log('  Client Admin (GV): director@greenvalley.uz');
  console.log('  Client User (GV):  ulugbek@greenvalley.uz');
  console.log('  Client Admin (TP): akbar@technoplus.uz');
  console.log('  Client User (TP):  kamola@technoplus.uz');
  console.log('  Client Admin (BF): sanjar@bukharafood.uz');

  await dataSource.destroy();
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
