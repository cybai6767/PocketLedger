package com.example.account.Entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;
import jakarta.validation.constraints.*;

@Data
@TableName("transaction")
public class Transaction {
    @TableId(type = IdType.AUTO)
    private Long id;

    @NotNull(message = "必须指定账户")
    private Long accountId;

    @NotBlank(message = "类型不能为空")
    private String type;

    @NotNull(message = "金额不能为空")
    @DecimalMin(value = "0.01", message = "金额必须大于0")
    private BigDecimal amount;

    @NotBlank(message = "币种不能为空")
    private String currency;

    private String category;   // 分类可空，不加校验
    private String note;       // 备注可空

    @NotNull(message = "日期不能为空")
    private LocalDate date;
}
