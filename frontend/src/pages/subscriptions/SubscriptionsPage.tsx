import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { subscriptionsApi, paymentsApi } from '../../api';
import toast from 'react-hot-toast';
import {
  Check, Crown, Zap, Star, Shield,
  Clock, AlertCircle, CheckCircle, XCircle,
  Calendar, Receipt, Loader2, ExternalLink
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────

interface Plan {
  id: string;
  name: string;
  code: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  features: string[];
  limits: Record<string, number>;
  sortOrder: number;
}

interface CompanySubscription {
  company: {
    id: string;
    name: string;
    subscriptionPlan: string;
    subscriptionExpiresAt: string | null;
  };
  plan: Plan | null;
  isActive: boolean;
  isExpired: boolean;
  daysRemaining: number | null;
}

interface PaymentRecord {
  id: string;
  planCode: string;
  billingPeriod: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  status: string;
  orderId: string;
  providerTransactionId: string | null;
  paidAt: string | null;
  createdAt: string;
  createdBy?: { firstName: string; lastName: string };
}

// ─── Constants ──────────────────────────────────────────────────

const planIcons: Record<string, any> = {
  free: Shield,
  basic: Star,
  professional: Zap,
  enterprise: Crown,
};

const planColors: Record<string, string> = {
  free: '#6B7280',
  basic: '#3B82F6',
  professional: '#7C3AED',
  enterprise: '#F59E0B',
};

const statusLabels: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'Kutilmoqda', color: '#F59E0B', icon: Clock },
  paid: { label: 'To\'langan', color: '#10B981', icon: CheckCircle },
  failed: { label: 'Xatolik', color: '#EF4444', icon: XCircle },
  cancelled: { label: 'Bekor qilingan', color: '#6B7280', icon: XCircle },
  expired: { label: 'Muddati o\'tgan', color: '#9CA3AF', icon: Clock },
};

const methodLabels: Record<string, { label: string; logo: string }> = {
  payme: { label: 'Payme', logo: '💳' },
  click: { label: 'Click', logo: '📱' },
};

function formatPrice(amount: number, currency: string = 'UZS') {
  if (currency === 'UZS') {
    return new Intl.NumberFormat('uz-UZ').format(amount) + ' so\'m';
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

// ─── Component ──────────────────────────────────────────────────

export default function SubscriptionsPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<CompanySubscription | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'plans' | 'history'>('plans');
  // Polling state: after redirect back, we poll the backend for confirmed status
  const [pollingPaymentId, setPollingPaymentId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const plansRes = await subscriptionsApi.getPlans();
      setPlans(plansRes.data);

      if (user?.companyId) {
        const [subRes, payRes] = await Promise.all([
          subscriptionsApi.getCompanySubscription(user.companyId),
          paymentsApi.getByCompany(user.companyId),
        ]);
        setSubscription(subRes.data);
        setPayments(payRes.data);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Payment status polling ─────────────────────────────────
  // After user returns from provider checkout, we poll the backend
  // to determine actual payment result. Frontend redirect alone is NOT trusted.

  const startPolling = useCallback((paymentId: string) => {
    setPollingPaymentId(paymentId);
    let attempts = 0;
    const maxAttempts = 30; // ~60 seconds

    pollingRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await paymentsApi.getStatus(paymentId);
        const { status } = res.data;

        if (status === 'paid') {
          clearInterval(pollingRef.current!);
          setPollingPaymentId(null);
          toast.success('To\'lov muvaffaqiyatli tasdiqlandi!', { duration: 5000 });
          loadData();
        } else if (status === 'failed' || status === 'cancelled' || status === 'expired') {
          clearInterval(pollingRef.current!);
          setPollingPaymentId(null);
          toast.error('To\'lov amalga oshmadi. Qaytadan urinib ko\'ring.', { duration: 5000 });
          loadData();
        } else if (attempts >= maxAttempts) {
          clearInterval(pollingRef.current!);
          setPollingPaymentId(null);
          toast('To\'lov holati hali aniqlanmadi. Sahifani yangilang.', {
            icon: '⏳',
            duration: 6000,
          });
          loadData();
        }
      } catch {
        // Network error during poll — keep trying
      }
    }, 2000);
  }, [loadData]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // ─── Handle return from provider page ───────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentReturn = params.get('payment');
    const paymentId = params.get('paymentId');

    if (paymentReturn === 'return' && paymentId) {
      // User returned from provider checkout — start polling backend for real status
      window.history.replaceState({}, '', '/subscriptions');
      startPolling(paymentId);
    } else if (paymentReturn === 'failed') {
      window.history.replaceState({}, '', '/subscriptions');
      toast.error('To\'lov bekor qilindi yoki xatolik yuz berdi.', { duration: 5000 });
      loadData();
    }
  }, [startPolling, loadData]);

  // ─── Subscribe: create payment → redirect to hosted checkout ─

  const handleSubscribe = async (planCode: string, method: 'payme' | 'click') => {
    if (!user?.companyId) {
      toast.error('Kompaniya topilmadi');
      return;
    }

    try {
      setPaymentLoading(`${planCode}-${method}`);
      const res = await paymentsApi.create({
        companyId: user.companyId,
        planCode,
        billingPeriod,
        paymentMethod: method,
        returnUrl: window.location.origin + '/subscriptions?payment=return',
      });

      const { paymentUrl, paymentId } = res.data;

      if (paymentUrl) {
        // Store paymentId so we can poll after redirect back
        sessionStorage.setItem('pendingPaymentId', paymentId);

        toast.success('To\'lov sahifasiga yo\'naltirilmoqda...', { duration: 2000 });

        // Redirect to provider-hosted checkout page
        // User cards/OTP are handled entirely by the provider
        window.location.href = paymentUrl;
      } else {
        toast.error('To\'lov havola yaratilmadi');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'To\'lov yaratishda xatolik');
    } finally {
      setPaymentLoading(null);
    }
  };

  // ─── Render ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  // If polling, show a full-screen overlay
  if (pollingPaymentId) {
    return (
      <div style={{
        padding: '24px 32px',
        maxWidth: 1280,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 400,
        gap: 20,
      }}>
        <Loader2 size={48} style={{ color: 'var(--brand-primary)', animation: 'spin 1s linear infinite' }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          To'lov tasdiqlanmoqda...
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, textAlign: 'center', maxWidth: 400 }}>
          To'lov provayderi javobini kutmoqdamiz. Iltimos, sahifani yopmang.
          Natija avtomatik ravishda yangilanadi.
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  const currentPlanCode = subscription?.company.subscriptionPlan || 'free';

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', margin: 0 }}>
          Obuna rejalar
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 6, fontSize: 15 }}>
          Buxgalteriya xizmatlaridan foydalanish uchun o'zingizga mos rejani tanlang
        </p>
      </div>

      {/* Current subscription status */}
      {subscription && (
        <div style={{
          background: `linear-gradient(135deg, ${planColors[currentPlanCode]}15, ${planColors[currentPlanCode]}08)`,
          border: `1px solid ${planColors[currentPlanCode]}30`,
          borderRadius: 16,
          padding: '20px 24px',
          marginBottom: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: `${planColors[currentPlanCode]}20`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {(() => {
                const Icon = planIcons[currentPlanCode] || Shield;
                return <Icon size={24} style={{ color: planColors[currentPlanCode] }} />;
              })()}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>
                {subscription.company.name}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                Joriy reja: <span style={{ color: planColors[currentPlanCode], fontWeight: 600 }}>
                  {currentPlanCode.charAt(0).toUpperCase() + currentPlanCode.slice(1)}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {subscription.daysRemaining !== null && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Qolgan kunlar</div>
                <div style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: subscription.daysRemaining < 7 ? '#EF4444' : planColors[currentPlanCode],
                  fontFamily: 'var(--font-display)',
                }}>
                  {subscription.daysRemaining}
                </div>
              </div>
            )}
            {subscription.isExpired && (
              <div style={{
                background: '#FEF2F2',
                color: '#EF4444',
                padding: '8px 16px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <AlertCircle size={16} />
                Muddati tugagan!
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--bg-secondary)', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        <button
          onClick={() => setActiveTab('plans')}
          style={{
            padding: '10px 24px',
            borderRadius: 10,
            border: 'none',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            background: activeTab === 'plans' ? 'var(--card-bg)' : 'transparent',
            color: activeTab === 'plans' ? 'var(--text-primary)' : 'var(--text-secondary)',
            boxShadow: activeTab === 'plans' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
          }}
        >
          Obuna rejalar
        </button>
        <button
          onClick={() => setActiveTab('history')}
          style={{
            padding: '10px 24px',
            borderRadius: 10,
            border: 'none',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            background: activeTab === 'history' ? 'var(--card-bg)' : 'transparent',
            color: activeTab === 'history' ? 'var(--text-primary)' : 'var(--text-secondary)',
            boxShadow: activeTab === 'history' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
          }}
        >
          To'lovlar tarixi ({payments.length})
        </button>
      </div>

      {activeTab === 'plans' && (
        <>
          {/* Billing toggle */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: 'var(--card-bg)',
              border: '1px solid var(--card-border)',
              borderRadius: 14,
              padding: '6px 8px',
            }}>
              <button
                onClick={() => setBillingPeriod('monthly')}
                style={{
                  padding: '10px 22px',
                  borderRadius: 10,
                  border: 'none',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: billingPeriod === 'monthly' ? 'var(--brand-primary)' : 'transparent',
                  color: billingPeriod === 'monthly' ? '#fff' : 'var(--text-secondary)',
                  transition: 'all 0.2s',
                }}
              >
                <Calendar size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                Oylik
              </button>
              <button
                onClick={() => setBillingPeriod('yearly')}
                style={{
                  padding: '10px 22px',
                  borderRadius: 10,
                  border: 'none',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: billingPeriod === 'yearly' ? 'var(--brand-primary)' : 'transparent',
                  color: billingPeriod === 'yearly' ? '#fff' : 'var(--text-secondary)',
                  transition: 'all 0.2s',
                }}
              >
                <Calendar size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                Yillik
                <span style={{
                  background: billingPeriod === 'yearly' ? 'rgba(255,255,255,0.2)' : '#10B98120',
                  color: billingPeriod === 'yearly' ? '#fff' : '#10B981',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 6,
                  marginLeft: 8,
                }}>
                  -17%
                </span>
              </button>
            </div>
          </div>

          {/* Plans grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 20,
            marginBottom: 32,
          }}>
            {plans.map((plan) => {
              const isCurrentPlan = plan.code === currentPlanCode;
              const PlanIcon = planIcons[plan.code] || Shield;
              const color = planColors[plan.code] || '#6B7280';
              const price = billingPeriod === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
              const isProfessional = plan.code === 'professional';

              return (
                <div
                  key={plan.id}
                  style={{
                    background: 'var(--card-bg)',
                    border: isProfessional ? `2px solid ${color}` : '1px solid var(--card-border)',
                    borderRadius: 20,
                    padding: 28,
                    position: 'relative',
                    boxShadow: isProfessional
                      ? `0 8px 32px ${color}20`
                      : '0 2px 12px rgba(0,0,0,0.04)',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                  }}
                >
                  {isProfessional && (
                    <div style={{
                      position: 'absolute',
                      top: -12,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: `linear-gradient(135deg, ${color}, #9333EA)`,
                      color: '#fff',
                      padding: '5px 18px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                    }}>
                      Mashhur
                    </div>
                  )}

                  {/* Plan icon & name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: `${color}15`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <PlanIcon size={22} style={{ color }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                        {plan.name}
                      </div>
                      {isCurrentPlan && (
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color,
                          background: `${color}15`,
                          padding: '2px 8px',
                          borderRadius: 6,
                        }}>
                          Joriy reja
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  {plan.description && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
                      {plan.description}
                    </p>
                  )}

                  {/* Price */}
                  <div style={{ marginBottom: 20 }}>
                    {plan.code === 'free' ? (
                      <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                        Bepul
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                          <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                            {formatPrice(price, plan.currency)}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                          {billingPeriod === 'yearly' ? '/ yil' : '/ oy'}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Features */}
                  <div style={{ marginBottom: 24 }}>
                    {plan.features?.map((feature, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <Check size={16} style={{ color, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{feature}</span>
                      </div>
                    ))}
                  </div>

                  {/* Limits */}
                  {plan.limits && (
                    <div style={{
                      background: 'var(--bg-secondary)',
                      borderRadius: 12,
                      padding: '12px 14px',
                      marginBottom: 20,
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                    }}>
                      {plan.limits.maxUsers && (
                        <div style={{ marginBottom: 4 }}>Foydalanuvchilar: <b>{plan.limits.maxUsers === -1 ? 'Cheksiz' : plan.limits.maxUsers}</b></div>
                      )}
                      {plan.limits.maxBranches && (
                        <div style={{ marginBottom: 4 }}>Filiallar: <b>{plan.limits.maxBranches === -1 ? 'Cheksiz' : plan.limits.maxBranches}</b></div>
                      )}
                      {plan.limits.maxTransactionsPerMonth && (
                        <div>Tranzaksiyalar/oy: <b>{plan.limits.maxTransactionsPerMonth === -1 ? 'Cheksiz' : plan.limits.maxTransactionsPerMonth}</b></div>
                      )}
                    </div>
                  )}

                  {/* Action buttons — redirect to hosted checkout */}
                  {plan.code === 'free' ? (
                    <div style={{
                      textAlign: 'center',
                      padding: '12px',
                      color: 'var(--text-secondary)',
                      fontSize: 14,
                    }}>
                      {isCurrentPlan ? 'Joriy rejangiz' : 'Doim bepul'}
                    </div>
                  ) : isCurrentPlan && !subscription?.isExpired ? (
                    <div style={{
                      textAlign: 'center',
                      padding: '12px',
                      color,
                      fontSize: 14,
                      fontWeight: 600,
                    }}>
                      <CheckCircle size={16} style={{ marginRight: 6, verticalAlign: -3 }} />
                      Faol obuna
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* Payme button */}
                      <button
                        onClick={() => handleSubscribe(plan.code, 'payme')}
                        disabled={!!paymentLoading}
                        style={{
                          width: '100%',
                          padding: '12px 20px',
                          borderRadius: 12,
                          border: 'none',
                          fontSize: 14,
                          fontWeight: 700,
                          cursor: paymentLoading ? 'wait' : 'pointer',
                          background: `linear-gradient(135deg, #00CDAC, #02AAB0)`,
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          opacity: paymentLoading === `${plan.code}-payme` ? 0.7 : 1,
                          transition: 'all 0.2s',
                        }}
                      >
                        {paymentLoading === `${plan.code}-payme` ? (
                          <div className="spinner" style={{ width: 18, height: 18 }} />
                        ) : (
                          <>
                            <ExternalLink size={16} />
                            Payme orqali to'lash
                          </>
                        )}
                      </button>

                      {/* Click button */}
                      <button
                        onClick={() => handleSubscribe(plan.code, 'click')}
                        disabled={!!paymentLoading}
                        style={{
                          width: '100%',
                          padding: '12px 20px',
                          borderRadius: 12,
                          border: 'none',
                          fontSize: 14,
                          fontWeight: 700,
                          cursor: paymentLoading ? 'wait' : 'pointer',
                          background: `linear-gradient(135deg, #27AE60, #2ECC71)`,
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          opacity: paymentLoading === `${plan.code}-click` ? 0.7 : 1,
                          transition: 'all 0.2s',
                        }}
                      >
                        {paymentLoading === `${plan.code}-click` ? (
                          <div className="spinner" style={{ width: 18, height: 18 }} />
                        ) : (
                          <>
                            <ExternalLink size={16} />
                            Click orqali to'lash
                          </>
                        )}
                      </button>

                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 4 }}>
                        To'lov provayder sahifasida amalga oshiriladi
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Payment methods info */}
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: 16,
            padding: 24,
            display: 'flex',
            gap: 24,
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 600 }}>
              Qabul qilingan to'lov usullari:
            </div>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: '#00CDAC10',
                padding: '8px 16px',
                borderRadius: 10,
                border: '1px solid #00CDAC30',
              }}>
                <span style={{ fontSize: 20 }}>💳</span>
                <span style={{ fontWeight: 700, color: '#02AAB0', fontSize: 15 }}>Payme</span>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: '#27AE6010',
                padding: '8px 16px',
                borderRadius: 10,
                border: '1px solid #27AE6030',
              }}>
                <span style={{ fontSize: 20 }}>📱</span>
                <span style={{ fontWeight: 700, color: '#27AE60', fontSize: 15 }}>Click</span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              Barcha to'lovlar xavfsiz provider sahifasida amalga oshiriladi
            </div>
          </div>
        </>
      )}

      {activeTab === 'history' && (
        <div style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: 16,
          overflow: 'hidden',
        }}>
          {payments.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <Receipt size={48} style={{ color: 'var(--text-tertiary)', marginBottom: 16 }} />
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)' }}>
                To'lovlar tarixi mavjud emas
              </div>
              <p style={{ color: 'var(--text-tertiary)', fontSize: 13, marginTop: 8 }}>
                Obuna rejasini tanlab to'lovni amalga oshiring
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Buyurtma</th>
                    <th style={thStyle}>Reja</th>
                    <th style={thStyle}>Davr</th>
                    <th style={thStyle}>Summa</th>
                    <th style={thStyle}>Usul</th>
                    <th style={thStyle}>Holat</th>
                    <th style={thStyle}>Provider ID</th>
                    <th style={thStyle}>Sana</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    const status = statusLabels[p.status] || statusLabels.pending;
                    const StatusIcon = status.icon;
                    const method = methodLabels[p.paymentMethod] || { label: p.paymentMethod, logo: '💰' };

                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--card-border)' }}>
                        <td style={tdStyle}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
                            {p.orderId}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            fontWeight: 600,
                            color: planColors[p.planCode] || 'var(--text-primary)',
                            textTransform: 'capitalize',
                          }}>
                            {p.planCode}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                            {p.billingPeriod === 'yearly' ? 'Yillik' : 'Oylik'}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                            {formatPrice(p.amount, p.currency)}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {method.logo} {method.label}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '4px 10px',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 600,
                            color: status.color,
                            background: `${status.color}12`,
                          }}>
                            <StatusIcon size={14} />
                            {status.label}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>
                            {p.providerTransactionId || '—'}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                            {new Date(p.createdAt).toLocaleDateString('uz-UZ')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '14px 16px',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  background: 'var(--bg-secondary)',
  borderBottom: '1px solid var(--card-border)',
};

const tdStyle: React.CSSProperties = {
  padding: '14px 16px',
  fontSize: 14,
  color: 'var(--text-primary)',
};
