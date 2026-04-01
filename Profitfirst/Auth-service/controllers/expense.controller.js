const expenseService = require('../services/expense.service');

class ExpenseController {
  async create(req, res) {
    try {
      const result = await expenseService.addExpense(req.user.userId, req.body);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async list(req, res) {
    try {
      const { from, to } = req.query;
      const result = await expenseService.getExpenses(req.user.userId, from, to);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new ExpenseController();