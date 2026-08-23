package com.example.account.Controller;

import com.example.account.Entity.Account;
import com.example.account.Mapper.AccountMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@CrossOrigin(origins = "http://localhost:5173")
@RestController
@RequestMapping("/api/accounts")
public class AccountController {
    @Autowired
    private AccountMapper accountMapper;

    @GetMapping           // GET /api/accounts 查全部
    public List<Account> list() { return accountMapper.selectList(null); }

    @PostMapping          // POST /api/accounts 新建
    public Account add(@RequestBody Account a) { accountMapper.insert(a); return a; }

    @DeleteMapping("/{id}")  // DELETE /api/accounts/1 删除
    public void remove(@PathVariable Long id) { accountMapper.deleteById(id); }
}
