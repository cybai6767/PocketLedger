package com.example.account.Mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.account.Entity.Transaction;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface TransactionMapper extends BaseMapper<Transaction> {
}
