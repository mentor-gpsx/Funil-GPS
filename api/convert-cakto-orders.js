/**
 * Conversor: Transforma resposta /orders da Cakto para formato estruturado
 * Uso: const converted = convertCaktoOrders(jsonData)
 */

function convertCaktoOrders(caktoData) {
  // Se for string, parsear
  if (typeof caktoData === 'string') {
    caktoData = JSON.parse(caktoData);
  }

  const customers = [];
  const charges = [];
  const subscriptions = [];
  const customerMap = {};

  // Extrair clientes ÚNICOS dos orders
  const orders = caktoData.results || caktoData.orders || [];

  orders.forEach((order, idx) => {
    // Criar cliente se não existir
    const customerId = order.buyer_id || order.customer_id || `cust_${idx}`;
    const customerName = order.buyer_name || order.customer_name || order.buyer_email || 'Cliente';
    const customerEmail = order.buyer_email || order.customer_email || `cliente${idx}@example.com`;

    if (!customerMap[customerId]) {
      customerMap[customerId] = true;
      customers.push({
        id: customerId,
        name: customerName,
        email: customerEmail,
        phone: order.buyer_phone || order.phone || '',
        created_at: order.created_at ? order.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
      });
    }

    // Converter order para charge
    charges.push({
      id: order.id || `charge_${idx}`,
      customer_id: customerId,
      customer_name: customerName,
      amount: parseFloat(order.total_amount || order.amount || 0),
      status: mapOrderStatus(order.status),
      due_date: order.created_at ? order.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
      paid_date: order.paid_at || order.completed_at ? (order.paid_at || order.completed_at).split('T')[0] : null,
      description: order.product_name || order.description || 'Venda',
      payment_method: mapPaymentMethod(order.payment_method || order.method),
      reference: order.id || `ORDER-${idx}`,
    });

    // Se tiver assinatura recorrente, criar subscription
    if (order.is_subscription || order.recurring) {
      subscriptions.push({
        id: order.subscription_id || `sub_${customerId}_${idx}`,
        customer_id: customerId,
        amount: parseFloat(order.total_amount || order.amount || 0),
        status: 'active',
        next_charge_date: calculateNextChargeDate(order.created_at),
        plan: order.plan_name || 'Padrão',
      });
    }
  });

  // Se não tiver clientes, usar valor default
  if (customers.length === 0) {
    customers.push({
      id: 'cust_default',
      name: 'Cliente',
      email: 'cliente@example.com',
      phone: '',
      created_at: new Date().toISOString().split('T')[0],
    });
  }

  // Se não tiver charges, usar value default
  if (charges.length === 0) {
    charges.push({
      id: 'charge_default',
      customer_id: customers[0].id,
      customer_name: customers[0].name,
      amount: 0,
      status: 'pending',
      due_date: new Date().toISOString().split('T')[0],
      paid_date: null,
      description: 'Sem dados',
      payment_method: 'desconhecido',
      reference: 'DEFAULT',
    });
  }

  // Se não tiver subscriptions, criar uma
  if (subscriptions.length === 0) {
    subscriptions.push({
      id: 'sub_default',
      customer_id: customers[0].id,
      amount: charges[0]?.amount || 0,
      status: 'active',
      next_charge_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      plan: 'Padrão',
    });
  }

  return {
    customers,
    charges,
    subscriptions,
  };
}

function mapOrderStatus(status) {
  const statusMap = {
    'completed': 'paid',
    'paid': 'paid',
    'pending': 'pending',
    'failed': 'failed',
    'cancelled': 'failed',
    'refunded': 'refunded',
    'processing': 'pending',
  };
  return statusMap[status?.toLowerCase()] || 'pending';
}

function mapPaymentMethod(method) {
  const methodMap = {
    'pix': 'pix',
    'boleto': 'boleto',
    'credit_card': 'cc',
    'debit_card': 'debit',
    'wallet': 'wallet',
  };
  return methodMap[method?.toLowerCase()] || 'desconhecido';
}

function calculateNextChargeDate(lastChargeDate) {
  if (!lastChargeDate) {
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  }
  const date = new Date(lastChargeDate);
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().split('T')[0];
}

// Exportar para Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { convertCaktoOrders };
}
