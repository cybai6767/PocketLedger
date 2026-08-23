package com.example.account.Controller;

import com.example.account.Entity.Account;
import com.example.account.Entity.Transaction;
import com.example.account.Mapper.AccountMapper;
import com.example.account.Mapper.TransactionMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;

@CrossOrigin
@RestController
@RequestMapping("/api/transactions")
public class TransactionController {

    @Autowired
    private TransactionMapper transactionMapper;

    @Autowired
    private AccountMapper accountMapper;

    @GetMapping
    public List<Transaction> list() {
        return transactionMapper.selectList(null);
    }

    @PostMapping
    @Transactional
    public Transaction add(@jakarta.validation.Valid @RequestBody Transaction t) {
        // 1. 保存交易记录
        transactionMapper.insert(t);

        // 2. 联动更新关联账户的余额
        Account acc = accountMapper.selectById(t.getAccountId());
        if (acc != null) {
            BigDecimal balance = acc.getBalance();
            if ("expense".equals(t.getType())) {
                acc.setBalance(balance.subtract(t.getAmount()));
            } else if ("income".equals(t.getType())) {
                acc.setBalance(balance.add(t.getAmount()));
            }
            accountMapper.updateById(acc);
        }

        return t;
    }

    @DeleteMapping("/{id}")
    @Transactional
    public void remove(@PathVariable Long id) {
        Transaction t = transactionMapper.selectById(id);
        if (t != null) {
            // 联动反向更新关联账户的余额
            Account acc = accountMapper.selectById(t.getAccountId());
            if (acc != null) {
                BigDecimal balance = acc.getBalance();
                if ("expense".equals(t.getType())) {
                    acc.setBalance(balance.add(t.getAmount()));
                } else if ("income".equals(t.getType())) {
                    acc.setBalance(balance.subtract(t.getAmount()));
                }
                accountMapper.updateById(acc);
            }
            transactionMapper.deleteById(id);
        }
    }
}
