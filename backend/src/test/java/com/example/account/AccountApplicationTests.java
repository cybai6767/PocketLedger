package com.example.account;

import com.baomidou.mybatisplus.core.toolkit.Assert;
import com.example.account.Entity.Account;
import com.example.account.Mapper.AccountMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;

@SpringBootTest
class AccountApplicationTests {

	@Autowired
	private AccountMapper accountMapper;
	@Test
	void contextLoads() {
		System.out.println(("----- selectAll method test ------"));
		List<Account> userList = accountMapper.selectList(null);
		Assert.isTrue(5 == userList.size(), "");
		userList.forEach(System.out::println);
	}

}
