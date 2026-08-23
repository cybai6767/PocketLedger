package com.example.account.Entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import lombok.NonNull;

import java.math.BigDecimal;

@Data
@TableName("account")
public class Account {
    @TableId(type = IdType.AUTO)
    private Long id;

    @NotNull(message = "账户名不能为空")
    private String name;

    @NotBlank(message = "账户类型不能为空")
    private String type;

    private String currency;

    private BigDecimal balance;
}
